// Ether Mines · flat colors with no light and no fog (04-render.js MeshBasicMaterial with fog: false): the great
// diamond in the sky and its gems, the ring of orange blocks, the floating ethers, the birds.
Shader "EtherMines/Unlit"
{
    Properties { _Color ("Color", Color) = (1,1,1,1) }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _Color;
            struct appdata { float4 vertex : POSITION; fixed4 color : COLOR; };
            struct v2f { float4 pos : SV_POSITION; fixed4 color : COLOR; };
            v2f vert (appdata v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.color = v.color * _Color; return o; }
            fixed4 frag (v2f i) : SV_Target { return i.color; }
            ENDCG
        }
    }
}
