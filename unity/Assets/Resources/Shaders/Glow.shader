// Ether Mines · glowing parts (16-mobs.js abox with `basic`: an unlit color, MeshBasicMaterial), a mob's
// eyes and cracks, the bolts; see-through when _Color's alpha is under 1 (a Rift Shadow's body).
Shader "EtherMines/Glow"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Src", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Dst", Float) = 0
        [Toggle] _ZWrite ("ZWrite", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        Pass
        {
            Blend [_SrcBlend] [_DstBlend]
            ZWrite [_ZWrite]
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #include "UnityCG.cginc"
            fixed4 _Color;
            struct v2f { float4 pos : SV_POSITION; UNITY_FOG_COORDS(0) };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); UNITY_TRANSFER_FOG(o, o.pos); return o; }
            fixed4 frag (v2f i) : SV_Target { fixed4 c = _Color; UNITY_APPLY_FOG(unity_FogColor, c); return c; }
            ENDCG
        }
    }
}
