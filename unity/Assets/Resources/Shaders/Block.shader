// Ether Mines · solid blocks, in the clay look (04-render.js opMat): the atlas, its glowing parts, the
// mesher's shading (ambient occlusion, face light) in the vertex colour, and the toy-brick bevel: a light
// rim and a thin dark seam inside every face's own tile.
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
        Tags { "RenderType"="TransparentCutout" "Queue"="AlphaTest" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Lambert alphatest:_Cutoff addshadow
        #pragma target 3.0
        sampler2D _MainTex;
        sampler2D _EmissionTex;
        float _Tiles;
        float _Bevel;
        struct Input { float2 uv_MainTex; float4 color : COLOR; };
        void surf (Input IN, inout SurfaceOutput o)
        {
            fixed4 c = tex2D(_MainTex, IN.uv_MainTex);
            float2 tq = frac(IN.uv_MainTex * _Tiles);
            float ed = min(min(tq.x, 1.0 - tq.x), min(tq.y, 1.0 - tq.y));
            float bevel = lerp(0.84, 1.0, smoothstep(0.0, 0.028, ed)) * lerp(1.1, 1.0, smoothstep(0.028, 0.1, ed));
            o.Albedo = c.rgb * IN.color.rgb * lerp(1.0, bevel, _Bevel);
            o.Emission = tex2D(_EmissionTex, IN.uv_MainTex).rgb;
            o.Alpha = c.a;
        }
        ENDCG
    }
    Fallback "Legacy Shaders/Transparent/Cutout/Diffuse"
}
