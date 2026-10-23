// Ether Mines · what the lit shaders share under URP: the web's Lambert light (the sun with its shadows,
// the sky's ambient, the lanterns and lamps nearby), the screen-space ambient occlusion when the renderer
// has it, the fog; and the passes URP asks of every opaque thing (its shadow, its depth, its normals).
#ifndef ETHER_LIT_INCLUDED
#define ETHER_LIT_INCLUDED

#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

float _EM_Emis; // what glows in the blocks glows brighter at night (Sky.cs)

// diffuse light on a surface of this color (three's MeshLambertMaterial, as Unity's Lambert did): the sky's
// ambient from the light probe (Sky.cs sets the trilight), the sun and its shadows, every other light near
half3 EtherLambert(half3 albedo, float3 posWS, half3 nWS, float4 posCS)
{
    float4 shadowCoord = TransformWorldToShadowCoord(posWS);
    Light sun = GetMainLight(shadowCoord);
    half3 ambient = SampleSH(nWS);
    half3 direct = sun.color * (sun.shadowAttenuation * sun.distanceAttenuation) * saturate(dot(nWS, sun.direction));
#if defined(_SCREEN_SPACE_OCCLUSION)
    AmbientOcclusionFactor ao = GetScreenSpaceAmbientOcclusion(GetNormalizedScreenSpaceUV(posCS));
    ambient *= ao.indirectAmbientOcclusion;
    direct *= ao.directAmbientOcclusion;
#endif
    half3 lit = ambient + direct;
#if defined(_ADDITIONAL_LIGHTS)
    uint n = GetAdditionalLightsCount();
    for (uint i = 0u; i < n; ++i)
    {
        Light l = GetAdditionalLight(i, posWS, half4(1, 1, 1, 1));
        lit += l.color * (l.distanceAttenuation * l.shadowAttenuation) * saturate(dot(nWS, l.direction));
    }
#endif
    return albedo * lit;
}

// ---------- the shadow it casts (ShadowCaster): biased along the light, as URP's own ----------
float3 _LightDirection;
float3 _LightPosition;
float4 EtherShadowPos(float3 posWS, float3 nWS)
{
#if defined(_CASTING_PUNCTUAL_LIGHT_SHADOW)
    float3 ld = normalize(_LightPosition - posWS);
#else
    float3 ld = _LightDirection;
#endif
    float4 cs = TransformWorldToHClip(ApplyShadowBias(posWS, nWS, ld));
#if UNITY_REVERSED_Z
    cs.z = min(cs.z, UNITY_NEAR_CLIP_VALUE);
#else
    cs.z = max(cs.z, UNITY_NEAR_CLIP_VALUE);
#endif
    return cs;
}

#endif
