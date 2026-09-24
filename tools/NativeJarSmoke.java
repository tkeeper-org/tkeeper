import java.lang.reflect.Method;

class NativeJarSmoke {
    public static void main(String[] args) throws Exception {
        String actual = platform();
        if (!args[0].equals("all") && !args[0].equals(actual)) {
            throw new IllegalStateException("Jar target is " + args[0] + ", but this JVM runs on " + actual);
        }

        load("org.rocksdb.RocksDB", "loadLibrary");
        load("org.exploit.bigint.LibGMP", "load");
        load("org.exploit.sodium.LibSodium", "load");
        if (Boolean.parseBoolean(args[1])) {
            load("org.exploit.ecc.secp256k1.LibSecp256k1", "load");
        }
        Class.forName("io.netty.internal.tcnative.SSL", false, NativeJarSmoke.class.getClassLoader())
                .getMethod("getGroupName", long.class);
        System.out.println("Verified Netty TLS native ABI");
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
                arch.equals("aarch64") || arch.equals("arm64") ? "arm64" : arch;
        return family + "-" + cpu;
    }
}
