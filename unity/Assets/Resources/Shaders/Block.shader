// Ether Mines · solid blocks, in the clay look (04-render.js opMat): the atlas, its glowing parts, the
// mesher's shading (ambient occlusion, face light) in the vertex colour, and the toy-brick bevel: a light
// rim and a thin dark seam inside every face's own tile. URP: lit as the web's Lambert (EtherLit.hlsl),
// casting and taking shadows, with its depth and normals for the screen's effects.
Shader "EtherMines/Block"
{
    Properties
    {
        _MainTex ("Atlas", 2D) = "white" {}
        _EmissionTex ("Emission", 2D) = "black" {}
        _Cutoff ("Alpha cutoff", Range(0,1)) = 0.5
        _Tiles ("Tiles per side", Float) = 16
        _Bevel ("Bevel", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType"="TransparentCutout" "Queue"="AlphaTest" "RenderPipeline"="UniversalPipeline" }

        HLSLINCLUDE
        #include "EtherLit.hlsl"
        TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
        TEXTURE2D(_EmissionTex); SAMPLER(sampler_EmissionTex);
        CBUFFER_START(UnityPerMaterial)
            float4 _MainTex_ST;
            float _Cutoff, _Tiles, _Bevel;
        CBUFFER_END
        struct A { float4 pos : POSITION; float3 n : NORMAL; float2 uv : TEXCOORD0; float4 color : COLOR; };
        struct V { float4 cs : SV_POSITION; float2 uv : TEXCOORD0; float3 ws : TEXCOORD1; half3 n : TEXCOORD2; half4 color : COLOR; half fog : TEXCOORD3; };
        V vert (A a)
        {
            V o;
            o.ws = TransformObjectToWorld(a.pos.xyz);
            o.ws += EtherLeafWind(o.ws, a.uv); // leaves in the wind
            o.cs = TransformWorldToHClip(o.ws);
            o.n = TransformObjectToWorldNormal(a.n);
            o.uv = a.uv;
            o.color = a.color;
            o.fog = ComputeFogFactor(o.cs.z);
            return o;
        }
        half4 Albedo (float2 uv, half4 vc)
        {
            half4 c = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, uv);
            float2 tq = frac(uv * _Tiles);
            float ed = min(min(tq.x, 1.0 - tq.x), min(tq.y, 1.0 - tq.y));
            float bevel = lerp(0.84, 1.0, smoothstep(0.0, 0.028, ed)) * lerp(1.1, 1.0, smoothstep(0.028, 0.1, ed));
            return half4(c.rgb * vc.rgb * lerp(1.0, bevel, _Bevel), c.a);
        }
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #pragma multi_compile_fog
            half4 frag (V i) : SV_Target
            {
                half4 c = Albedo(i.uv, i.color);
                clip(c.a - _Cutoff);
                half3 col = EtherLambert(c.rgb, i.ws, normalize(i.n), i.cs);
                col += SAMPLE_TEXTURE2D(_EmissionTex, sampler_EmissionTex, i.uv).rgb * (_EM_Emis > 0 ? _EM_Emis : 1);
                return half4(MixFog(col, i.fog), 1);
            }
            ENDHLSL
        }
        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode"="ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0
            HLSLPROGRAM
            #pragma vertex sv
            #pragma fragment sf
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            struct SV { float4 cs : SV_POSITION; float2 uv : TEXCOORD0; };
            SV sv (A a) { SV o; float3 ws = TransformObjectToWorld(a.pos.xyz); ws += EtherLeafWind(ws, a.uv); o.cs = EtherShadowPos(ws, TransformObjectToWorldNormal(a.n)); o.uv = a.uv; return o; }
            half4 sf (SV i) : SV_Target { clip(SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv).a - _Cutoff); return 0; }
            ENDHLSL
        }
        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode"="DepthOnly" }
            ZWrite On ColorMask R
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment df
            half4 df (V i) : SV_Target { clip(SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv).a - _Cutoff); return i.cs.z; }
            ENDHLSL
        }
        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode"="DepthNormals" }
            ZWrite On
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment nf
            half4 nf (V i) : SV_Target { clip(SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv).a - _Cutoff); return half4(NormalizeNormalPerPixel(i.n), 0); }
            ENDHLSL
        }
    }
}
