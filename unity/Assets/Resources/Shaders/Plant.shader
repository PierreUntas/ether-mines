// Ether Mines · grass, flowers, crossed plants (04-render.js plMat): both sides drawn, cut out, and the
// top of each plant sways in the wind.
Shader "EtherMines/Plant"
{
    Properties
    {
        _MainTex ("Atlas", 2D) = "white" {}
        _EmissionTex ("Emission", 2D) = "black" {}
        _Cutoff ("Alpha cutoff", Range(0,1)) = 0.5
    }
    SubShader
    {
        Tags { "RenderType"="TransparentCutout" "Queue"="AlphaTest" }
        Cull Off
        CGPROGRAM
        #pragma surface surf Lambert alphatest:_Cutoff vertex:vert addshadow
        #pragma target 3.0
        sampler2D _MainTex;
        sampler2D _EmissionTex;
        struct Input { float2 uv_MainTex; float4 color : COLOR; };
        void vert (inout appdata_full v)
        {
            float t = _Time.y;
            float3 p = mul(unity_ObjectToWorld, v.vertex).xyz;
            if (frac(p.y) > 0.5)
            {
                float w = sin(t * 1.6 + p.x * 0.7 + p.z * 0.5) + 0.5 * sin(t * 2.7 + p.z * 1.3);
                v.vertex.x += w * 0.06;
                v.vertex.z += w * 0.04;
            }
        }
        void surf (Input IN, inout SurfaceOutput o)
        {
            fixed4 c = tex2D(_MainTex, IN.uv_MainTex);
            o.Albedo = c.rgb * IN.color.rgb;
            o.Emission = tex2D(_EmissionTex, IN.uv_MainTex).rgb;
            o.Alpha = c.a;
        }
        ENDCG
    }
    Fallback "Legacy Shaders/Transparent/Cutout/Diffuse"
}
