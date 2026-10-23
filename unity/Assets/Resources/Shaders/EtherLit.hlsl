// Ether Mines · what the lit shaders share under URP: the web's Lambert light (the sun with its shadows,
// the sky's ambient, the lanterns and lamps nearby), the screen-space ambient occlusion when the renderer
// has it, the fog; and the passes URP asks of every opaque thing (its shadow, its depth, its normals).
#ifndef ETHER_LIT_INCLUDED
#define ETHER_LIT_INCLUDED

#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

float _EM_Emis; // what glows in the blocks glows brighter at night (Sky.cs)

// ---------- the wind (Unity only: the web's leaves stand still) ----------
// One field over the whole world, so neighbouring leaves move together and no seam opens between them: a
// sway, a quicker flutter on top, and slow gusts that roll across the land; stronger in a shower (Weather.cs)
TEXTURE2D(_EM_WindMask); SAMPLER(sampler_EM_WindMask); // the atlas's tiles that are leaves (WorldView.cs)
float _EM_WindK;
float3 EtherWind(float3 ws, float amount)
{
    float t = _Time.y * 0.6; // a slow, calm wind
    float gust = 0.55 + 0.45 * sin(t * 0.37 + ws.x * 0.045 + ws.z * 0.031);
    float sway = sin(t * 1.6 + ws.x * 0.55 + ws.z * 0.4) + 0.45 * sin(t * 2.9 + ws.z * 1.1 - ws.x * 0.35);
    float flutter = sin(t * 7.3 + ws.x * 2.1 + ws.y * 1.7 + ws.z * 1.9);
    float k = amount * gust * _EM_WindK;
    return float3(sway * 0.055 + flutter * 0.012, flutter * 0.012, sway * 0.04 - flutter * 0.01) * k;
}
// a block's vertex, moved if its face shows a leaf tile (the tile from the UV, inset by the mesher)
float3 EtherLeafWind(float3 ws, float2 uv)
{
    float2 tile = floor(uv * 16.0);
    float leaf = SAMPLE_TEXTURE2D_LOD(_EM_WindMask, sampler_EM_WindMask, (tile + 0.5) / 16.0, 0).r;
    return leaf > 0.5 ? EtherWind(ws, 2.0) : float3(0, 0, 0); // twice the grass's base sway
}

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

// ---------- the haze and the sun's rays (Unity only) ----------
// The fog glows warm toward the sun, and where its light comes through (between trunks, out of a cave's
// mouth, past a tower) the air itself shows the beams: a few steps along the view ray, each asking the
// sun's shadow map whether that bit of air is lit. Sky.cs gives the sun's direction and glow (none at
// night or under water); _EM_Rays turns the beams off (Settings → Sun rays, off on phones by default).
float4 _EM_SunDir;   // toward the sun
half4 _EM_SunGlow;   // the light it lends the haze
float _EM_Rays;      // 1: march the beams
float EtherNoise(float2 px) { return frac(52.9829189 * frac(dot(px, float2(0.06711056, 0.00583715)))); }
half3 EtherFog(half3 col, half fogFactor, float3 posWS, float4 posCS, bool beams)
{
    float3 cam = GetCameraPositionWS();
    float3 ray = posWS - cam;
    float dist = max(length(ray), 1e-4);
    float3 v = ray / dist;
    float s = saturate(dot(v, _EM_SunDir.xyz));
    half3 glow = _EM_SunGlow.rgb;
    // the fog itself: lit golden toward the sun, as the sky's halo is
    half3 fogC = unity_FogColor.rgb + glow * (pow(s, 5.0) * 0.5 + pow(s, 40.0) * 0.45);
    half3 c = MixFogColor(col, fogC, fogFactor);
#if !defined(_MAIN_LIGHT_SHADOWS_SCREEN)
    if (beams && _EM_Rays > 0.5 && glow.r + glow.g + glow.b > 0.01)
    {
        const int N = 10;
        float len = min(dist, 56.0);
        float stepL = len / N;
        float j = EtherNoise(posCS.xy); // each pixel starts a little further: no bands, a fine grain instead
        float lit = 0;
        for (int k = 0; k < N; k++)
            lit += MainLightRealtimeShadow(TransformWorldToShadowCoord(cam + v * ((k + j) * stepL)));
        lit /= N;
        float phase = pow(s, 6.0) * 1.4 + pow(s, 30.0) * 1.2 + 0.04; // the air shines forward, toward the sun
        float air = 1 - exp(-len * 0.015);
        c += glow * (lit * phase * air * 0.45);
    }
#endif
    return c;
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
