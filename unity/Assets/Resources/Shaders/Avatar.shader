// Ether Mines · the players' avatars (14-startup.js makeAvatar: Lambert materials in each player's color),
// the mobs, the animals, the held tools: one plain color per part, lit by the sun, casting shadows. URP:
// lit as the web's Lambert (EtherLit.hlsl).
Shader "EtherMines/Avatar"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _Glow ("Glow", Color) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" }

        HLSLINCLUDE
        #include "EtherLit.hlsl"
        CBUFFER_START(UnityPerMaterial)
            half4 _Color, _Glow;
        CBUFFER_END
        struct A { float4 pos : POSITION; float3 n : NORMAL; float2 uv : TEXCOORD0; float4 color : COLOR; };
        struct V { float4 cs : SV_POSITION; float2 uv : TEXCOORD0; float3 ws : TEXCOORD1; half3 n : TEXCOORD2; half4 color : COLOR; half fog : TEXCOORD3; };
        V vert (A a)
        {
            V o;
            o.ws = TransformObjectToWorld(a.pos.xyz);
            o.cs = TransformWorldToHClip(o.ws);
            o.n = TransformObjectToWorldNormal(a.n);
            o.uv = a.uv;
            o.color = a.color;
            o.fog = ComputeFogFactor(o.cs.z);
            return o;
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
                half3 col = EtherLambert(_Color.rgb, i.ws, normalize(i.n), i.cs) + _Glow.rgb + _Color.rgb * 0.12;
                return half4(EtherFog(col, i.fog, i.ws, i.cs, true), 1);
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
            SV sv (A a) { SV o; float3 ws = TransformObjectToWorld(a.pos.xyz); o.cs = EtherShadowPos(ws, TransformObjectToWorldNormal(a.n)); o.uv = a.uv; return o; }
            half4 sf (SV i) : SV_Target { return 0; }
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
            half4 df (V i) : SV_Target { return i.cs.z; }
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
            half4 nf (V i) : SV_Target { return half4(NormalizeNormalPerPixel(i.n), 0); }
            ENDHLSL
        }
    }
}
