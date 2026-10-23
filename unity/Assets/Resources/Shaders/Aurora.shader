// Ether Mines · the aurora (04-render.js, the clay look): two long curtains of light low over the horizon,
// cyan into lavender, slowly waving, only at night; added light, seen from both sides.
Shader "EtherMines/Aurora"
{
    Properties { _Night ("Night", Float) = 0 }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend One One
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float _Night;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            fixed4 frag (v2f i) : SV_Target
            {
                float time = _Time.y, x = i.uv.x, y = i.uv.y;
                float wave = 0.5 + 0.5 * sin(x * 26.0 + time * 0.45 + 2.2 * sin(x * 7.0 - time * 0.25));
                float rays = 0.55 + 0.45 * sin(x * 210.0 + 3.0 * sin(x * 31.0 + time * 0.6));
                float band = smoothstep(0.0, 0.12, y) * pow(1.0 - y, 2.2) * smoothstep(0.0, 0.1, x) * smoothstep(1.0, 0.9, x);
                float3 col = lerp(float3(0.4, 1.0, 0.9), float3(0.75, 0.55, 1.0), smoothstep(0.1, 0.7, y + 0.12 * sin(x * 9.0 + time * 0.2)));
                float a = band * pow(wave, 1.6) * rays * _Night * 0.9;
                return fixed4(col * a, 1);
            }
            ENDCG
        }
    }
}
