// Ether Mines · water (04-render.js waMat): the surface (vertices high in their block) ripples, tinted light
// blue as on the web; here it also mirrors the sky (more at a grazing look, Fresnel), catches a glint of
// the sun, is clearer where it's shallow and deeper blue where it's deep, with a little foam along the
// shore (where the camera's depth is at hand: not on phones); and it can be seen from below. URP: the sun
// and the sky's ambient as EtherLit.hlsl has them, the scene's depth from URP's depth texture.
Shader "EtherMines/Water"
{
    Properties
    {
        _MainTex ("Water", 2D) = "white" {}
        _Color ("Tint", Color) = (0.863, 0.937, 1, 0.8)
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "IgnoreProjector"="True" "RenderPipeline"="UniversalPipeline" }
        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode"="UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fog
            #include "EtherLit.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST;
                half4 _Color;
            CBUFFER_END
            float _EM_Depth;               // 1: the camera's depth is there (Game.cs)
            half4 _EM_SkyTop, _EM_SkyHor;  // the sky's colors now (Sky.cs)
            struct A { float4 pos : POSITION; float3 n : NORMAL; float2 uv : TEXCOORD0; };
            struct V { float4 cs : SV_POSITION; float2 uv : TEXCOORD0; float3 ws : TEXCOORD1; float3 n : TEXCOORD2; half fog : TEXCOORD3; };
            V vert (A a)
            {
                float t = _Time.y;
                float3 p = TransformObjectToWorld(a.pos.xyz);
                float3 n = a.n;
                if (frac(p.y) > 0.5)
                {
                    p.y += (sin(p.x * 1.3 + t * 1.7) + sin(p.z * 1.1 - t * 1.3) + sin((p.x + p.z) * 0.6 + t * 0.9)) * 0.022 - 0.035;
                    if (n.y > 0.5)
                    {
                        float dx = (1.3 * cos(p.x * 1.3 + t * 1.7) + 0.6 * cos((p.x + p.z) * 0.6 + t * 0.9)) * 0.022;
                        float dz = (1.1 * cos(p.z * 1.1 - t * 1.3) + 0.6 * cos((p.x + p.z) * 0.6 + t * 0.9)) * 0.022;
                        n = normalize(float3(-dx * 6.0, 1.0, -dz * 6.0));
                    }
                }
                V o;
                o.ws = p;
                o.cs = TransformWorldToHClip(p);
                o.uv = TRANSFORM_TEX(a.uv, _MainTex);
                o.n = TransformObjectToWorldNormal(n);
                o.fog = ComputeFogFactor(o.cs.z);
                return o;
            }
            half4 frag (V i, bool front : SV_IsFrontFace) : SV_Target
            {
                float3 n = normalize(i.n) * (front ? 1 : -1);
                float3 v = normalize(GetCameraPositionWS() - i.ws);
                Light sun = GetMainLight(TransformWorldToShadowCoord(i.ws));
                float3 l = sun.direction;
                half4 tex = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv) * _Color;
                // lit as the web's Lambert: the sky's ambient and the sun
                half3 c = tex.rgb * (SampleSH(n) + sun.color * sun.shadowAttenuation * saturate(dot(n, l)));
                float a = _Color.a;
                // deep and shallow, and the shore's foam (the distance to what's behind the surface)
                if (_EM_Depth > 0.5)
                {
                    float2 suv = GetNormalizedScreenSpaceUV(i.cs);
                    float scene = LinearEyeDepth(SampleSceneDepth(suv), _ZBufferParams);
                    float here = -TransformWorldToView(i.ws).z;
                    float behind = scene - here;
                    float deep = saturate(behind / 6);
                    c *= lerp(1.08, 0.62, deep);
                    a = lerp(0.5, 0.92, saturate(behind / 3));
                    float wob = 0.65 + 0.35 * sin(i.ws.x * 3.1 + i.ws.z * 2.3 + _Time.y * 2.2);
                    float foam = (1 - saturate(behind / 0.35)) * wob * step(0.5, n.y);
                    c = lerp(c, half3(0.95, 0.97, 1), foam * 0.7);
                    a = max(a, foam * 0.9);
                }
                // the sky in it, more at a grazing look; a glint of the sun
                float3 r = reflect(-v, n);
                half3 sky = lerp(_EM_SkyHor.rgb, _EM_SkyTop.rgb, saturate(r.y * 1.6));
                float fres = 0.04 + 0.96 * pow(1 - saturate(dot(n, v)), 5);
                c = lerp(c, sky, fres * 0.75 * (front ? 1 : 0));
                c += sun.color * pow(saturate(dot(r, l)), 220) * 1.6 * step(0, l.y) * sun.shadowAttenuation;
                a = saturate(a + fres * 0.3);
                return half4(EtherFog(c, i.fog, i.ws, i.cs, false), a);
            }
            ENDHLSL
        }
    }
}
