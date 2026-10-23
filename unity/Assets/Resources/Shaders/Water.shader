// Ether Mines · water (04-render.js waMat): the surface (vertices high in their block) ripples, tinted light
// blue as on the web; here it also mirrors the sky (more at a grazing look, Fresnel), catches a glint of
// the sun, is clearer where it's shallow and deeper blue where it's deep, with a little foam along the
// shore (where the camera's depth is at hand: not on phones); and it can be seen from below.
Shader "EtherMines/Water"
{
    Properties
    {
        _MainTex ("Water", 2D) = "white" {}
        _Color ("Tint", Color) = (0.863, 0.937, 1, 0.8)
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "IgnoreProjector"="True" }
        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #pragma target 3.0
            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _Color;
            UNITY_DECLARE_DEPTH_TEXTURE(_CameraDepthTexture);
            float _EM_Depth;            // 1: the camera's depth is there (Game.cs)
            fixed4 _EM_SkyTop, _EM_SkyHor; // the sky's colors now (Sky.cs)
            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 wp : TEXCOORD1;
                float3 n : TEXCOORD2;
                float4 sp : TEXCOORD3;
                UNITY_FOG_COORDS(4)
            };
            v2f vert (appdata_full v)
            {
                float t = _Time.y;
                float3 p = mul(unity_ObjectToWorld, v.vertex).xyz;
                float3 n = v.normal;
                if (frac(p.y) > 0.5)
                {
                    v.vertex.y += (sin(p.x * 1.3 + t * 1.7) + sin(p.z * 1.1 - t * 1.3) + sin((p.x + p.z) * 0.6 + t * 0.9)) * 0.022 - 0.035;
                    if (n.y > 0.5)
                    {
                        float dx = (1.3 * cos(p.x * 1.3 + t * 1.7) + 0.6 * cos((p.x + p.z) * 0.6 + t * 0.9)) * 0.022;
                        float dz = (1.1 * cos(p.z * 1.1 - t * 1.3) + 0.6 * cos((p.x + p.z) * 0.6 + t * 0.9)) * 0.022;
                        n = normalize(float3(-dx * 6.0, 1.0, -dz * 6.0));
                    }
                }
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.texcoord, _MainTex);
                o.wp = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.n = UnityObjectToWorldNormal(n);
                o.sp = ComputeScreenPos(o.pos);
                COMPUTE_EYEDEPTH(o.sp.z);
                UNITY_TRANSFER_FOG(o, o.pos);
                return o;
            }
            fixed4 frag (v2f i, fixed facing : VFACE) : SV_Target
            {
                float3 n = normalize(i.n) * (facing > 0 ? 1 : -1);
                float3 v = normalize(_WorldSpaceCameraPos - i.wp);
                float3 l = normalize(_WorldSpaceLightPos0.xyz);
                fixed4 tex = tex2D(_MainTex, i.uv) * _Color;
                // lit as the web's Lambert: the sky's ambient and the sun
                fixed3 c = tex.rgb * (ShadeSH9(float4(n, 1)) + _LightColor0.rgb * saturate(dot(n, l)));
                float a = _Color.a;
                // deep and shallow, and the shore's foam (the distance to what's behind the surface)
                if (_EM_Depth > 0.5)
                {
                    float behind = LinearEyeDepth(SAMPLE_DEPTH_TEXTURE_PROJ(_CameraDepthTexture, UNITY_PROJ_COORD(i.sp))) - i.sp.z;
                    float deep = saturate(behind / 6);
                    c *= lerp(1.08, 0.62, deep);
                    a = lerp(0.5, 0.92, saturate(behind / 3));
                    float wob = 0.65 + 0.35 * sin(i.wp.x * 3.1 + i.wp.z * 2.3 + _Time.y * 2.2);
                    float foam = (1 - saturate(behind / 0.35)) * wob * step(0.5, n.y);
                    c = lerp(c, fixed3(0.95, 0.97, 1), foam * 0.7);
                    a = max(a, foam * 0.9);
                }
                // the sky in it, more at a grazing look; a glint of the sun
                float3 r = reflect(-v, n);
                fixed3 sky = lerp(_EM_SkyHor.rgb, _EM_SkyTop.rgb, saturate(r.y * 1.6));
                float fres = 0.04 + 0.96 * pow(1 - saturate(dot(n, v)), 5);
                c = lerp(c, sky, fres * 0.75 * step(0, facing));
                c += _LightColor0.rgb * pow(saturate(dot(r, l)), 220) * 1.6 * step(0, l.y);
                a = saturate(a + fres * 0.3);
                fixed4 o = fixed4(c, a);
                UNITY_APPLY_FOG(i.fogCoord, o);
                return o;
            }
            ENDCG
        }
    }
    Fallback "Legacy Shaders/Transparent/Diffuse"
}
