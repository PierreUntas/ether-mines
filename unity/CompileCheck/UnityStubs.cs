// Stand-ins for the parts of the Unity API the game's scripts use: signatures only, for type-checking
// outside the editor (CompileCheck.csproj). Never shipped, never run. Add what a new script needs.
#pragma warning disable
using System;
using System.Collections.Generic;

namespace UnityEngine
{
    public class Object
    {
        public string name;
        public static void Destroy(Object o) { }
        public static void DontDestroyOnLoad(Object o) { }
        public static T FindAnyObjectByType<T>() where T : Object => null;
        public static T[] FindObjectsByType<T>(FindObjectsSortMode m) where T : Object => null;
        public static T Instantiate<T>(T o) where T : Object => o;
        public static implicit operator bool(Object o) => o != null;
    }
    public enum FindObjectsSortMode { None, InstanceID }
    public class Component : Object
    {
        public GameObject gameObject;
        public Transform transform;
        public T GetComponent<T>() => default;
        public T[] GetComponentsInChildren<T>() => null;
    }
    public class Behaviour : Component { public bool enabled; }
    public class MonoBehaviour : Behaviour { }
    public class GameObject : Object
    {
        public GameObject() { }
        public GameObject(string name) { }
        public Transform transform;
        public T AddComponent<T>() where T : Component => default;
        public T GetComponent<T>() => default;
        public T[] GetComponentsInChildren<T>() => null;
        public void SetActive(bool v) { } public bool activeSelf; public static GameObject CreatePrimitive(PrimitiveType t) => null;
    }
    public class Transform : Component
    {
        public Vector3 position, localPosition, eulerAngles, localScale;
        public Quaternion rotation, localRotation;
        public void SetParent(Transform p, bool worldPositionStays) { }
        public void SetPositionAndRotation(Vector3 p, Quaternion q) { }
    }
    public struct Vector2 { public float x, y; public Vector2(float x, float y) { this.x = x; this.y = y; } public float magnitude => 0; }
    public enum PrimitiveType { Cube, Sphere }
    public class GUIStyleState { public Color textColor; }
    public class GUIContent { public GUIContent(string s) { } }
    public enum EventType { KeyDown, KeyUp, Repaint }
    public class Event { public static Event current; public EventType type; public KeyCode keyCode; public void Use() { } }
    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public Vector3 normalized => this;
        public float magnitude => 0; public static Vector3 operator *(Vector3 a, double b) => a;
        public static Vector3 zero => default; public static Vector3 up => default; public static Vector3 forward => default; public static Vector3 one => default; public static Vector3 right => default;
        public float sqrMagnitude => 0; public static float Distance(Vector3 a, Vector3 b) => 0; public static Vector3 Lerp(Vector3 a, Vector3 b, float t) => a;
        public float this[int i] { get => 0; set { } } public static Vector3 operator /(Vector3 a, float b) => a;
        public static Vector3 operator +(Vector3 a, Vector3 b) => a;
        public static Vector3 operator -(Vector3 a, Vector3 b) => a;
        public static Vector3 operator -(Vector3 a) => a;
        public static Vector3 operator *(Vector3 a, float b) => a;
        public static Vector3 operator *(float b, Vector3 a) => a;
        public static implicit operator Vector4(Vector3 v) => default;
    }
    public struct Vector4 { public float x, y, z, w; public Vector4(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; } }
    public struct Quaternion
    {
        public static Quaternion identity => default;
        public static Quaternion Euler(float x, float y, float z) => default; public static Quaternion AngleAxis(float a, Vector3 axis) => default;
        public static Quaternion LookRotation(Vector3 f) => default;
        public static Quaternion operator *(Quaternion a, Quaternion b) => a;
        public static Vector3 operator *(Quaternion a, Vector3 b) => b;
    }
    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a = 1) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color white => default; public static Color magenta => default; public Color(float r, float g, float b) : this(r, g, b, 1) { } public static Color black => default; public static Color clear => default;
        public static Color Lerp(Color a, Color b, float t) => a;
        public static Color operator *(Color a, float b) => a;
    }
    public struct Color32 { public byte r, g, b, a; }
    public static class ColorUtility { public static bool TryParseHtmlString(string s, out Color c) { c = default; return true; } public static string ToHtmlStringRGB(Color c) => ""; }
    public struct Rect { public Rect(float x, float y, float w, float h) { this.x = x; this.y = y; width = w; height = h; } public float x, y, width, height; public float xMax => x + width; public float yMax => y + height; }
    public class RectOffset { public RectOffset(int l, int r, int t, int b) { } }
    public enum TextAnchor { UpperLeft, UpperCenter, UpperRight, MiddleLeft, MiddleCenter, MiddleRight, LowerLeft, LowerCenter, LowerRight }
    public enum FontStyle { Normal, Bold }
    public class GUIStyle { public GUIStyle(GUIStyle s) { } public GUIStyle() { } public bool richText; public int fontSize; public TextAnchor alignment; public FontStyle fontStyle; public RectOffset padding; public bool wordWrap; public GUIStyleState normal = new GUIStyleState(); public Vector2 CalcSize(GUIContent c) => default; public float CalcHeight(GUIContent c, float w) => 0; }
    public class GUISkin { public GUIStyle box, label, button, textField; }
    public static class GUI
    {
        public static GUISkin skin;
        public static Color color;
        public static void DrawTexture(Rect r, Texture t) { }
        public static void DrawTextureWithTexCoords(Rect r, Texture t, Rect uv) { }
        public static void Box(Rect r, string s) { }
        public static void Box(Rect r, string s, GUIStyle st) { }
        public static void Label(Rect r, string s) { }
        public static void Label(Rect r, string s, GUIStyle st) { }
        public static bool Button(Rect r, string s) => false;
        public static string TextField(Rect r, string s, int max) => s; public static string TextField(Rect r, string s, int max, GUIStyle st) => s; public static void SetNextControlName(string n) { } public static void FocusControl(string n) { }
        public static string PasswordField(Rect r, string s, char c, int max) => s;
    }
    public static class Screen { public static int width, height; }
    public static class Time { public static float deltaTime, time, unscaledDeltaTime; public static int frameCount; }
    public static class Random { public static int Range(int a, int b) => a; public static float Range(float a, float b) => a; public static float value; }
    public static class Mathf
    {
        public const float PI = 3.14159265f, Rad2Deg = 57.29578f, Deg2Rad = 0.0174533f;
        public static float Min(float a, float b) => a; public static float Max(float a, float b) => a;
        public static float Lerp(float a, float b, float t) => a; public static float Clamp(float v, float a, float b) => v;
        public static float Clamp01(float v) => v; public static float Atan2(float y, float x) => 0;
        public static int Clamp(int v, int a, int b) => v;
        public static float Sin(float a) => a; public static float Cos(float a) => a; public static float Abs(float a) => a;
        public static float Floor(float a) => a; public static int FloorToInt(float a) => 0;
    }
    public static class Debug { public static void Log(object o) { } public static void LogWarning(object o) { } public static void LogError(object o) { } public static void LogException(Exception e) { } }
    public static class Application { public static int targetFrameRate; public static string persistentDataPath; public static bool isMobilePlatform; }
    public static class PlayerPrefs
    {
        public static string GetString(string k, string d) => d; public static void SetString(string k, string v) { }
        public static int GetInt(string k, int d) => d; public static void SetInt(string k, int v) { }
        public static void Save() { } public static void DeleteKey(string k) { }
    }
    public static class SystemInfo { public static int processorCount; }
    public enum CursorLockMode { None, Locked, Confined }
    public static class Cursor { public static CursorLockMode lockState; public static bool visible; }
    public enum CameraClearFlags { Skybox, SolidColor, Depth, Nothing }
    public class Camera : Behaviour
    {
        public static Camera main;
        public float nearClipPlane, farClipPlane, fieldOfView;
        public CameraClearFlags clearFlags;
        public Color backgroundColor; public Vector3 WorldToScreenPoint(Vector3 p) => default;
    }
    public enum LightType { Directional, Point, Spot }
    public enum LightShadows { None, Hard, Soft }
    public class Light : Behaviour { public LightType type; public LightShadows shadows; public float shadowStrength, intensity, range; public Color color; }
    public enum FogMode { Linear = 1, Exponential, ExponentialSquared }
    public static class RenderSettings
    {
        public static Material skybox; public static bool fog; public static FogMode fogMode; public static Color fogColor;
        public static float fogStartDistance, fogEndDistance, fogDensity;
        public static Rendering.AmbientMode ambientMode; public static Color ambientSkyColor, ambientEquatorColor, ambientGroundColor, ambientLight;
    }
    public static class QualitySettings { public static float shadowDistance; }
    public class Shader : Object { public static Shader Find(string n) => null; }
    public class Texture : Object { public FilterMode filterMode; public TextureWrapMode wrapMode; public int anisoLevel, width, height; }
    public enum MeshTopology { Triangles, Lines }
    public enum FilterMode { Point, Bilinear, Trilinear }
    public enum TextureWrapMode { Repeat, Clamp }
    public enum TextureFormat { RGBA32, ARGB32 }
    public class Texture2D : Texture { public Texture2D(int w, int h, TextureFormat f, bool mip) { } public void Apply() { } public static Texture2D whiteTexture; }
    public static class ImageConversion { public static bool LoadImage(this Texture2D t, byte[] data) => true; }
    public class Material : Object
    {
        public Material(Shader s) { } public Material(Material m) { }
        public Shader shader; public Texture mainTexture; public Color color;
        public int renderQueue; public void SetTexture(string n, Texture t) { } public void SetColor(string n, Color c) { } public void SetVector(string n, Vector4 v) { }
        public void SetFloat(string n, float f) { }
    }
    public class TextAsset : Object { public string text; public byte[] bytes; }
    public static class Resources { public static T Load<T>(string p) where T : Object => null; }
    public class Mesh : Object
    {
        public void SetIndices(int[] i, MeshTopology t, int sub) { } public Rendering.IndexFormat indexFormat; public Vector3[] vertices, normals; public Vector2[] uv; public Color[] colors; public int[] triangles;
        public void RecalculateBounds() { } public void RecalculateNormals() { }
    }
    public class MeshFilter : Component { public Mesh sharedMesh, mesh; }
    public class Renderer : Component { public Material sharedMaterial, material; public Rendering.ShadowCastingMode shadowCastingMode; public bool receiveShadows; }
    public class MeshRenderer : Renderer { }
    public class AsyncOperation { public event Action<AsyncOperation> completed; public bool isDone; }
    public enum RuntimeInitializeLoadType { AfterSceneLoad, BeforeSceneLoad }
    [AttributeUsage(AttributeTargets.Method)] public class RuntimeInitializeOnLoadMethodAttribute : Attribute { public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType t) { } }
    public enum KeyCode { Space, LeftShift, C, LeftControl, V, F, Escape, E, T, I, Return, Alpha1, KeypadEnter }
    public static class Input
    {
        public static float GetAxisRaw(string a) => 0; public static Vector2 mouseScrollDelta; public static bool GetKey(KeyCode k) => false; public static bool GetKeyDown(KeyCode k) => false;
        public static bool GetMouseButtonDown(int b) => false; public static bool GetMouseButton(int b) => false;
    }
}
namespace UnityEngine.Rendering
{
    public enum IndexFormat { UInt16, UInt32 }
    public enum ShadowCastingMode { Off, On }
    public enum BlendMode { Zero, One, DstColor, SrcColor, OneMinusDstColor, SrcAlpha, OneMinusSrcColor, DstAlpha, OneMinusDstAlpha, SrcAlphaSaturate, OneMinusSrcAlpha }
    public enum AmbientMode { Skybox, Trilight, Flat }
}
namespace UnityEngine.Networking
{
    public class DownloadHandler { public string text; public byte[] data; }
    public class DownloadHandlerBuffer : DownloadHandler { }
    public class UploadHandler { }
    public class UploadHandlerRaw : UploadHandler { public UploadHandlerRaw(byte[] b) { } }
    public class UnityWebRequestAsyncOperation : UnityEngine.AsyncOperation { }
    public class UnityWebRequest : IDisposable
    {
        public enum Result { InProgress, Success, ConnectionError, ProtocolError, DataProcessingError }
        public UnityWebRequest(string url, string method) { }
        public DownloadHandler downloadHandler; public UploadHandler uploadHandler; public Result result; public long responseCode; public string error;
        public void SetRequestHeader(string n, string v) { }
        public UnityWebRequestAsyncOperation SendWebRequest() => null;
        public void Dispose() { }
    }
}
namespace UnityEngine.InputSystem
{
    public class ButtonControl { public bool isPressed, wasPressedThisFrame, wasReleasedThisFrame; }
    public class Vector2Control { public Vector2 ReadValue() => default; }
    public class Keyboard
    {
        public static Keyboard current;
        public ButtonControl digit2Key, digit3Key, digit4Key, digit5Key, digit6Key, digit7Key, digit8Key, digit9Key, wKey, aKey, sKey, dKey, zKey, qKey, cKey, vKey, fKey, eKey, tKey, iKey, spaceKey, leftShiftKey, rightShiftKey, leftCtrlKey, escapeKey, enterKey, numpadEnterKey, upArrowKey, downArrowKey, leftArrowKey, rightArrowKey, digit1Key;
    }
    public class Mouse { public static Mouse current; public Vector2Control delta, scroll, position; public ButtonControl leftButton, rightButton, middleButton; }
    public class Gamepad { public static Gamepad current; public Vector2Control leftStick, rightStick; public ButtonControl buttonSouth, buttonEast, buttonWest, buttonNorth, leftStickButton, rightTrigger, leftTrigger; }
}
