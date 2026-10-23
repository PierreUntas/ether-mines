// Ether Mines · glass, stained glass, leaves seen through: see-through blocks (04-render.js glMat). URP: lit as
// the web's Lambert (EtherLit.hlsl), blended over what's behind, no shadow of its own.
Shader "EtherMines/Glass"
{
    Properties
    {
        _MainTex ("Atlas", 2D) = "white" {}
        _EmissionTex ("Emission", 2D) = "black" {}
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
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fog
            #include "EtherLit.hlsl"
            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
            TEXTURE2D(_EmissionTex); SAMPLER(sampler_EmissionTex);
            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST;
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
            half4 frag (V i) : SV_Target
            {
                half4 c = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv);
                half3 col = EtherLambert(c.rgb * i.color.rgb, i.ws, normalize(i.n), i.cs);
                col += SAMPLE_TEXTURE2D(_EmissionTex, sampler_EmissionTex, i.uv).rgb * (_EM_Emis > 0 ? _EM_Emis : 1);
                return half4(MixFog(col, i.fog), c.a);
            }
            ENDHLSL
        }
    }
}
