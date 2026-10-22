// Ether Mines · the players' avatars (14-startup.js makeAvatar: Lambert materials in each player's color):
// one plain color per part, lit by the sun, casting shadows.
Shader "EtherMines/Avatar"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _Glow ("Glow", Color) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Lambert addshadow
        #pragma target 3.0
        fixed4 _Color;
        fixed4 _Glow;
        struct Input { float3 worldPos; };
        void surf (Input IN, inout SurfaceOutput o)
        {
            o.Albedo = _Color.rgb;
            o.Emission = _Glow.rgb + _Color.rgb * 0.12;
            o.Alpha = 1;
        }
        ENDCG
    }
    Fallback "Diffuse"
}
