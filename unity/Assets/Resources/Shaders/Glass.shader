// Ether Mines · glass, stained glass, leaves seen through: see-through blocks (04-render.js glMat)
Shader "EtherMines/Glass"
{
    Properties
    {
        _MainTex ("Atlas", 2D) = "white" {}
        _EmissionTex ("Emission", 2D) = "black" {}
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "IgnoreProjector"="True" }
        ZWrite Off
        CGPROGRAM
        #pragma surface surf Lambert alpha:fade
        sampler2D _MainTex;
        sampler2D _EmissionTex;
        struct Input { float2 uv_MainTex; float4 color : COLOR; };
        void surf (Input IN, inout SurfaceOutput o)
        {
            fixed4 c = tex2D(_MainTex, IN.uv_MainTex);
            o.Albedo = c.rgb * IN.color.rgb;
            o.Emission = tex2D(_EmissionTex, IN.uv_MainTex).rgb;
            o.Alpha = c.a;
        }
        ENDCG
    }
    Fallback "Legacy Shaders/Transparent/Diffuse"
}
