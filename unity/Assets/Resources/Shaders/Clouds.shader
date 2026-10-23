// Ether Mines · the clouds (04-render.js, the clay look): soft round clouds on a plane high over the world
// that follows the camera while its pattern stays put in the world and drifts slowly; tinted by the
// horizon, fainter at night, fading out toward the distance.
Shader "EtherMines/Clouds"
{
    Properties
    {
        _MainTex ("Clouds", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,0.85)
        _Drift ("Drift", Float) = 0
    }
    SubShader
    {
        Tags { "Queue"="Transparent-10" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            fixed4 _Color;
            float _Drift;
            struct v2f { float4 pos : SV_POSITION; float3 wp : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.wp = mul(unity_ObjectToWorld, v.vertex).xyz; return o; }
            fixed4 frag (v2f i) : SV_Target
            {
                // the game's x and z (Unity's z is mirrored): one tile every 300 blocks
                float2 uv = float2(i.wp.x / 300.0 + _Drift, -i.wp.z / 300.0);
                fixed4 t = tex2D(_MainTex, uv);
                float far = length(i.wp.xz - _WorldSpaceCameraPos.xz);
                fixed4 c = fixed4(t.rgb * _Color.rgb, t.a * _Color.a * (1 - smoothstep(260.0, 440.0, far)));
                return c;
            }
            ENDCG
        }
    }
}
