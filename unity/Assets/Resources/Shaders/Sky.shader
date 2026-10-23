// Ether Mines · the sky dome (04-render.js sky, 08-sky.js): a gradient from the horizon to the top, darker
// below the horizon, the sun's disc, its halo and its low glow along the horizon, and the moon at night
Shader "EtherMines/Sky"
{
    Properties
    {
        _Top ("Top", Color) = (0.56, 0.73, 1, 1)
        _Horizon ("Horizon", Color) = (0.95, 0.9, 1, 1)
        _SunColor ("Sun", Color) = (1, 0.96, 0.88, 1)
        _SunDir ("Sun direction", Vector) = (0, 1, 0, 0)
        _Night ("Night", Float) = 0
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" }
        Cull Off ZWrite Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _Top, _Horizon, _SunColor;
            float4 _SunDir;
            float _Night;
            struct v2f { float4 pos : SV_POSITION; float3 dir : TEXCOORD0; };
            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.dir = v.vertex.xyz;
                return o;
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float3 d = normalize(i.dir), sd = normalize(_SunDir.xyz);
                float h = d.y;
                fixed3 c = lerp(_Horizon.rgb, _Top.rgb, pow(saturate(h), 0.55));
                c = lerp(c, _Horizon.rgb * 0.8, saturate(-h * 3.0));
                float s = max(dot(d, sd), 0);
                c += _SunColor.rgb * (smoothstep(0.9985, 0.9992, s) * 1.4 + pow(s, 14.0) * 0.35 + pow(s, 4.0) * 0.3 * (1.0 - abs(sd.y)) * step(0.0, h + 0.1));
                float m = max(dot(d, -sd), 0);
                c += float3(0.95, 0.95, 1.0) * smoothstep(0.9990, 0.9994, m) * _Night;
                return fixed4(c, 1);
            }
            ENDCG
        }
    }
}
