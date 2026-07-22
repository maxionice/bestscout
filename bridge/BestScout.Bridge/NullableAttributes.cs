// The FM26 BepInEx host is .NET 6. Its generated interop reference set causes
// Roslyn to resolve nullable metadata to System.Runtime instead of embedding it.
// Keeping these compiler-only attributes in the plugin avoids a runtime type
// dependency while preserving nullable analysis in the bridge source.
namespace System.Runtime.CompilerServices;

[AttributeUsage(
    AttributeTargets.Class
    | AttributeTargets.Property
    | AttributeTargets.Field
    | AttributeTargets.Event
    | AttributeTargets.Parameter
    | AttributeTargets.ReturnValue
    | AttributeTargets.GenericParameter,
    AllowMultiple = false,
    Inherited = false)]
internal sealed class NullableAttribute : Attribute
{
    public NullableAttribute(byte flag)
    {
        NullableFlags = new[] { flag };
    }

    public NullableAttribute(byte[] flags)
    {
        NullableFlags = flags;
    }

    public byte[] NullableFlags { get; }
}

[AttributeUsage(
    AttributeTargets.Class
    | AttributeTargets.Struct
    | AttributeTargets.Method
    | AttributeTargets.Interface
    | AttributeTargets.Delegate,
    AllowMultiple = false,
    Inherited = false)]
internal sealed class NullableContextAttribute : Attribute
{
    public NullableContextAttribute(byte flag)
    {
        Flag = flag;
    }

    public byte Flag { get; }
}
