// Ether Mines · the sky dome (08-sky.js): a gradient from the horizon to the top, and the sun's glow
Shader "EtherMines/Sky"
{
    Properties
    {
        _Top ("Top", Color) = (0.56, 0.73, 1, 1)
        _Horizon ("Horizon", Color) = (0.95, 0.9, 1, 1)
        _SunColor ("Sun", Color) = (1, 0.96, 0.88, 1)
        _SunDir ("Sun direction", Vector) = (0, 1, 0, 0)
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
                float3 d = normalize(i.dir);
                float h = saturate(d.y);
                fixed3 c = lerp(_Horizon.rgb, _Top.rgb, pow(h, 0.55));
                float s = saturate(dot(d, normalize(_SunDir.xyz)));
                c += _SunColor.rgb * (pow(s, 600) * 1.2 + pow(s, 12) * 0.25);
                return fixed4(c, 1);
            }
            ENDCG
        }
    }
}
