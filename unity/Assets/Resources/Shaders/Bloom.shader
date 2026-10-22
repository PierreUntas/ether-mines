// Ether Mines · the clay look's glow (04-render.js glowComposer: three's UnrealBloomPass, strength 0.42,
// radius 0.6, threshold 0.84): what is brighter than the threshold bleeds a soft light around it. Made
// small and blurred down a chain of halved images, then brought back up and added over the picture.
Shader "Hidden/EtherMines/Bloom"
{
    Properties { _MainTex ("", 2D) = "white" {} }
    CGINCLUDE
    #include "UnityCG.cginc"
    sampler2D _MainTex, _BloomTex;
    float4 _MainTex_TexelSize;
    float _Threshold, _Strength, _Weight;
    struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
    v2f vert (appdata_img v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord; return o; }
    half3 S (float2 uv) { return tex2D(_MainTex, uv).rgb; }
    // four taps around: a box blur that halves without shimmering
    half3 Box (float2 uv, float d)
    {
        float4 o = _MainTex_TexelSize.xyxy * float4(-d, -d, d, d);
        return (S(uv + o.xy) + S(uv + o.zy) + S(uv + o.xw) + S(uv + o.zw)) * 0.25;
    }
    // only what is bright (the luminosity high pass: a narrow smoothstep over the threshold)
    half4 fPre (v2f i) : SV_Target
    {
        half3 c = Box(i.uv, 1);
        half l = dot(c, half3(0.299, 0.587, 0.114));
        return half4(c * smoothstep(_Threshold, _Threshold + 0.01, l), 1);
    }
    half4 fDown (v2f i) : SV_Target { return half4(Box(i.uv, 1), 1); }
    half4 fUp (v2f i) : SV_Target { return half4(Box(i.uv, 0.5) * _Weight, 1); }
    half4 fMix (v2f i) : SV_Target
    {
        half4 c = tex2D(_MainTex, i.uv);
        c.rgb += tex2D(_BloomTex, i.uv).rgb * _Strength;
        return c;
    }
    ENDCG
    SubShader
    {
        Cull Off ZWrite Off ZTest Always
        Pass { CGPROGRAM
            #pragma vertex vert
            #pragma fragment fPre
            ENDCG }
        Pass { CGPROGRAM
            #pragma vertex vert
            #pragma fragment fDown
            ENDCG }
        Pass { Blend One One
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment fUp
            ENDCG }
        Pass { CGPROGRAM
            #pragma vertex vert
            #pragma fragment fMix
            ENDCG }
    }
}
