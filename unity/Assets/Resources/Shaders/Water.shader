// Ether Mines · water (04-render.js waMat): the surface (vertices high in their block) ripples and catches
// the sun; 80% opaque, tinted light blue.
Shader "EtherMines/Water"
{
    Properties
    {
        _MainTex ("Water", 2D) = "white" {}
        _Color ("Tint", Color) = (0.863, 0.937, 1, 0.8)
        _SpecColor ("Specular", Color) = (0.54, 0.54, 0.63, 1)
        _Shininess ("Shininess", Range(0.01, 1)) = 0.55
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "IgnoreProjector"="True" }
        ZWrite Off
        CGPROGRAM
        #pragma surface surf BlinnPhong alpha:fade vertex:vert
        #pragma target 3.0
        sampler2D _MainTex;
        fixed4 _Color;
        half _Shininess;
        struct Input { float2 uv_MainTex; };
        void vert (inout appdata_full v)
        {
            float t = _Time.y;
            float3 p = mul(unity_ObjectToWorld, v.vertex).xyz;
            if (frac(p.y) > 0.5)
            {
                v.vertex.y += (sin(p.x * 1.3 + t * 1.7) + sin(p.z * 1.1 - t * 1.3) + sin((p.x + p.z) * 0.6 + t * 0.9)) * 0.022 - 0.035;
                if (v.normal.y > 0.5)
                {
                    float dx = (1.3 * cos(p.x * 1.3 + t * 1.7) + 0.6 * cos((p.x + p.z) * 0.6 + t * 0.9)) * 0.022;
                    float dz = (1.1 * cos(p.z * 1.1 - t * 1.3) + 0.6 * cos((p.x + p.z) * 0.6 + t * 0.9)) * 0.022;
                    v.normal = normalize(float3(-dx * 6.0, 1.0, -dz * 6.0));
                }
            }
        }
        void surf (Input IN, inout SurfaceOutput o)
        {
            fixed4 c = tex2D(_MainTex, IN.uv_MainTex) * _Color;
            o.Albedo = c.rgb;
            o.Alpha = _Color.a;
            o.Specular = _Shininess;
            o.Gloss = 1;
        }
        ENDCG
    }
    Fallback "Legacy Shaders/Transparent/Diffuse"
}
