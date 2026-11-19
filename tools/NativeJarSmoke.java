import java.lang.foreign.MemorySegment;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

class NativeJarSmoke {
    private static final String NATIVE_MODULE = "org.exploit.tkeeper.nativeaccess";

    public static void main(String[] args) throws Exception {
        String actual = platform();
        if (!args[0].equals("all") && !args[0].equals(actual)) {
            throw new IllegalStateException("Jar target is " + args[0] + ", but this JVM runs on " + actual);
        }

        if (args.length > 1 && args[1].equals("container")) {
            load("org.exploit.keeper.bootstrap.ContainerRuntime", "verify");
            verifyBase64();
            verifyNativeAccess();
        }

        load("org.exploit.keeper.bootstrap.ApplicationNativeLibraries", "load");
        Object version = Class.forName("org.rocksdb.RocksDB").getMethod("rocksdbVersion").invoke(null);
        if (version == null) throw new IllegalStateException("RocksDB was not initialized");
        System.out.println("Native libraries loaded on " + actual);
    }

    private static void verifyBase64() {
        var decoder = Base64.getDecoder();
        String decoded = new String(decoder.decode("VEtlZXBlcg=="), StandardCharsets.US_ASCII);
        if (!decoded.equals("TKeeper"))
            throw new IllegalStateException("Base64 decoding failed with intrinsics disabled");

        try {
            decoder.decode("?");
        } catch (IllegalArgumentException expected) {
            return;
        }

        throw new IllegalStateException("Base64 decoder accepted an invalid character");
    }

    private static void verifyNativeAccess() throws ClassNotFoundException {
        var nativeModule = Class.forName("org.rocksdb.RocksDB", false, NativeJarSmoke.class.getClassLoader()).getModule();
        if (!NATIVE_MODULE.equals(nativeModule.getName()) || !nativeModule.isNativeAccessEnabled())
            throw new IllegalStateException("Native access is missing from " + NATIVE_MODULE);

        try {
            MemorySegment.NULL.reinterpret(0);
        } catch (IllegalCallerException expected) {
            return;
        }

        throw new IllegalStateException("Unnamed module was allowed native access");
    }

    private static void load(String className, String methodName) throws Exception {
        Method method = Class.forName(className).getMethod(methodName);
        method.invoke(null);
        System.out.println("Loaded " + className);
    }

    private static String platform() {
        String os = System.getProperty("os.name").toLowerCase(java.util.Locale.ROOT);
        String arch = System.getProperty("os.arch").toLowerCase(java.util.Locale.ROOT);
        String family = os.contains("linux") ? "linux" :
                os.contains("mac") ? "macos" :
                os.contains("win") ? "windows" : os;
        String cpu = arch.equals("x86_64") || arch.equals("amd64") ? "amd64" :
                arch.equals("aarch64") || arch.equals("arm64") ? (family.equals("macos") ? "aarch64" : "arm64") : arch;
        return family + "-" + cpu;
    }
}
