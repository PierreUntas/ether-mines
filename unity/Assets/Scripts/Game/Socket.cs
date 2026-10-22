// Ether Mines · one WebSocket (System.Net.WebSockets: Mac, PC, iOS, Android), text messages only. The
// messages that arrive wait in a queue the game reads on its own thread (Drain), so nothing from the
// network ever touches Unity objects from elsewhere. Used by the game server link and Supabase Realtime.
using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace EtherMines.Game
{
    public sealed class Socket : IDisposable
    {
        readonly ClientWebSocket ws = new ClientWebSocket();
        readonly CancellationTokenSource stop = new CancellationTokenSource();
        readonly ConcurrentQueue<string> inbox = new ConcurrentQueue<string>();
        readonly SemaphoreSlim sending = new SemaphoreSlim(1, 1);
        public volatile bool Open, Closed;
        public string CloseReason = "";

        // the game's own site as the origin: the game server only lets in the pages it knows (ALLOWED_ORIGINS)
        public static async Task<Socket> Connect(string url, string origin = null)
        {
            var s = new Socket();
            if (origin != null) s.ws.Options.SetRequestHeader("Origin", origin);
            s.ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
            using (var t = new CancellationTokenSource(TimeSpan.FromSeconds(10)))
                await s.ws.ConnectAsync(new Uri(url), t.Token);
            s.Open = true;
            _ = Task.Run(s.ReadLoop);
            return s;
        }

        async Task ReadLoop()
        {
            var buf = new byte[16384];
            var msg = new System.IO.MemoryStream();
            try
            {
                while (!stop.IsCancellationRequested && ws.State == WebSocketState.Open)
                {
                    var r = await ws.ReceiveAsync(new ArraySegment<byte>(buf), stop.Token);
                    if (r.MessageType == WebSocketMessageType.Close)
                    {
                        CloseReason = ws.CloseStatusDescription ?? "";
                        break;
                    }
                    msg.Write(buf, 0, r.Count);
                    if (!r.EndOfMessage) continue;
                    if (r.MessageType == WebSocketMessageType.Text) inbox.Enqueue(Encoding.UTF8.GetString(msg.GetBuffer(), 0, (int)msg.Length));
                    msg.SetLength(0);
                }
            }
            catch (Exception e) { if (CloseReason.Length == 0) CloseReason = e.Message; }
            Open = false;
            Closed = true;
        }

        public bool TryRead(out string m) => inbox.TryDequeue(out m);

        public async void Send(string text)
        {
            if (!Open) return;
            await sending.WaitAsync();
            try
            {
                if (ws.State == WebSocketState.Open)
                    await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(text)), WebSocketMessageType.Text, true, stop.Token);
            }
            catch (Exception) { Open = false; Closed = true; }
            finally { sending.Release(); }
        }

        public void Dispose()
        {
            Open = false;
            Closed = true;
            try { if (ws.State == WebSocketState.Open) _ = ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None); } catch (Exception) { }
            stop.Cancel();
        }
    }
}
