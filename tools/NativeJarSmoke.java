import java.lang.reflect.Method;

class NativeJarSmoke {
    public static void main(String[] args) throws Exception {
        String actual = platform();
        if (!args[0].equals("all") && !args[0].equals(actual)) {
            throw new IllegalStateException("Jar target is " + args[0] + ", but this JVM runs on " + actual);
        }

        load("org.exploit.keeper.bootstrap.ApplicationNativeLibraries", "load");
        Object version = Class.forName("org.rocksdb.RocksDB").getMethod("rocksdbVersion").invoke(null);
        if (version == null) throw new IllegalStateException("RocksDB was not initialized");
        System.out.println("Native libraries loaded on " + actual);
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
