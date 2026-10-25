package fixture;

import org.exploit.bigint.BigInt;
import org.exploit.keeper.constant.lib.NativeLibraryConstants;
import org.exploit.keeper.service.lib.LibGMPLoader;
import org.exploit.keeper.service.lib.NativeLibraryLoader;
import org.rocksdb.RocksDB;

import java.util.List;
import java.util.Map;

public final class NativeLoadProbe {
    public static void main(String[] args) throws Exception {
        if (args.length > 0 && args[0].equals("system")) {
            new NativeLibraryLoader(Map.of(), Boolean.getBoolean(NativeLibraryConstants.ALLOW_SYSTEM_PROPERTY),
                    ClassLoader.getPlatformClassLoader()).load(List.of(new LibGMPLoader()));
        } else {
            Class.forName("org.exploit.keeper.bootstrap.ApplicationNativeLibraries").getMethod("load").invoke(null);
            RocksDB.loadLibrary();
            if (RocksDB.rocksdbVersion() == null) throw new AssertionError("RocksDB not initialized");
        }

        try (var sum = BigInt.valueOf(2).add(BigInt.valueOf(3))) {
            if (!sum.toString().equals("5")) throw new AssertionError("GMP arithmetic failed");
        }
        System.out.println("Native bootstrap and GMP arithmetic succeeded");
    }
}
