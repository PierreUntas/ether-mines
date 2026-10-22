// Ether Mines · a small JSON reader with no dependency (Unity compiles it as is; no System.Text.Json).
// objects -> Dictionary<string, object> (keys keep the file's order), arrays -> List<object>,
// numbers -> double, strings -> string, true/false -> bool, null -> null. Throws FormatException on bad input.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace EtherMines.Core
{
    public static class MiniJson
    {
        public static object Parse(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            var p = new Parser(json);
            p.SkipWs();
            var v = p.Value(0);
            p.SkipWs();
            if (p.i != json.Length) throw p.Error("trailing characters");
            return v;
        }

        sealed class Parser
        {
            readonly string s;
            public int i;
            readonly StringBuilder sb = new StringBuilder();
            public Parser(string s) { this.s = s; }

            public FormatException Error(string what) => new FormatException("JSON: " + what + " at " + i);

            public void SkipWs()
            {
                while (i < s.Length)
                {
                    char c = s[i];
                    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                    else if (i == 0 && c == '﻿') i++; // byte order mark
                    else break;
                }
            }

            public object Value(int depth)
            {
                if (depth > 512) throw Error("nested too deep");
                if (i >= s.Length) throw Error("unexpected end");
                char c = s[i];
                switch (c)
                {
                    case '{': return Obj(depth);
                    case '[': return Arr(depth);
                    case '"': return Str();
                    case 't': Lit("true"); return true;
                    case 'f': Lit("false"); return false;
                    case 'n': Lit("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return Num();
                        throw Error("unexpected '" + c + "'");
                }
            }

            void Lit(string w)
            {
                if (string.CompareOrdinal(s, i, w, 0, w.Length) != 0) throw Error("expected " + w);
                i += w.Length;
            }

            Dictionary<string, object> Obj(int depth)
            {
                var d = new Dictionary<string, object>();
                i++;
                SkipWs();
                if (i < s.Length && s[i] == '}') { i++; return d; }
                while (true)
                {
                    SkipWs();
                    if (i >= s.Length || s[i] != '"') throw Error("expected a key");
                    var k = Str();
                    SkipWs();
                    if (i >= s.Length || s[i] != ':') throw Error("expected ':'");
                    i++;
                    SkipWs();
                    d[k] = Value(depth + 1);
                    SkipWs();
                    if (i >= s.Length) throw Error("unexpected end");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; return d; }
                    throw Error("expected ',' or '}'");
                }
            }

            List<object> Arr(int depth)
            {
                var l = new List<object>();
                i++;
                SkipWs();
                if (i < s.Length && s[i] == ']') { i++; return l; }
                while (true)
                {
                    SkipWs();
                    l.Add(Value(depth + 1));
                    SkipWs();
                    if (i >= s.Length) throw Error("unexpected end");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; return l; }
                    throw Error("expected ',' or ']'");
                }
            }

            string Str()
            {
                i++; // opening quote
                sb.Length = 0;
                while (true)
                {
                    if (i >= s.Length) throw Error("unterminated string");
                    char c = s[i++];
                    if (c == '"') return sb.ToString();
                    if (c != '\\') { sb.Append(c); continue; }
                    if (i >= s.Length) throw Error("unterminated escape");
                    char e = s[i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 > s.Length) throw Error("bad \\u escape");
                            int h = 0;
                            for (int k = 0; k < 4; k++)
                            {
                                char x = s[i++];
                                int v = x >= '0' && x <= '9' ? x - '0' : x >= 'a' && x <= 'f' ? x - 'a' + 10 : x >= 'A' && x <= 'F' ? x - 'A' + 10 : -1;
                                if (v < 0) throw Error("bad \\u escape");
                                h = h * 16 + v;
                            }
                            sb.Append((char)h);
                            break;
                        default: throw Error("bad escape");
                    }
                }
            }

            double Num()
            {
                int st = i;
                if (s[i] == '-') i++;
                while (i < s.Length)
                {
                    char c = s[i];
                    if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') i++;
                    else break;
                }
                // double.Parse rounds correctly (IEEE round-to-nearest), as JavaScript does
                if (!double.TryParse(s.Substring(st, i - st), NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
                    throw Error("bad number");
                return d;
            }
        }

        // ---------- small helpers for reading parsed values ----------
        public static double ToDouble(object v, double fallback = 0)
        {
            if (v is double d) return d;
            if (v is bool b) return b ? 1 : 0;
            if (v is string str)
            {
                if (str == "Infinity") return double.PositiveInfinity;
                if (str == "-Infinity") return double.NegativeInfinity;
                if (str == "NaN") return double.NaN;
            }
            return fallback;
        }

        public static int ToInt(object v, int fallback = 0) => v is double d ? (int)d : v is bool b ? (b ? 1 : 0) : fallback;

        public static bool Truthy(object v)
        {
            if (v == null) return false;
            if (v is bool b) return b;
            if (v is double d) return d != 0 && !double.IsNaN(d);
            if (v is string s) return s.Length > 0;
            return true;
        }
    }
}
