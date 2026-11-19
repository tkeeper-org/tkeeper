import java.io.IOException;
import java.lang.module.ModuleFinder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;
import java.util.zip.ZipFile;

class DockerNativeModule {
    private static final String MODULE_NAME = "org.exploit.tkeeper.nativeaccess";
    private static final String SERVICES = "META-INF/services/";
    private static final String JLINE_NATIVE = "org/jline/nativ";
    private static final Set<String> NATIVE_PACKAGES = Set.of(
            "org/exploit/bigint",
            "org/exploit/bigint/gmp/bindings",
            "org/exploit/ecc/secp256k1",
            "org/exploit/ecc/secp256k1/bindings",
            "org/exploit/internal/buffer",
            "org/exploit/keeper/service/lib",
            "org/exploit/sodium",
            "org/exploit/sodium/bindings",
            JLINE_NATIVE,
            "org/rocksdb",
            "org/rocksdb/util"
    );

    public static void main(String[] args) throws IOException {
        if (args.length != 2)
            throw new IllegalArgumentException("Expected the verified application JAR and the native module output path");

        Path output = Path.of(args[1]);
        writeModule(Path.of(args[0]), output);

        if (ModuleFinder.of(output).find(MODULE_NAME).isEmpty())
            throw new IllegalStateException("Missing native module " + MODULE_NAME);
    }

    private static void writeModule(Path application, Path output) throws IOException {
        Manifest manifest = new Manifest();
        manifest.getMainAttributes().putValue("Manifest-Version", "1.0");
        manifest.getMainAttributes().putValue("Automatic-Module-Name", MODULE_NAME);

        try (var source = new JarFile(application.toFile(), false, ZipFile.OPEN_READ, Runtime.version());
             var target = new JarOutputStream(Files.newOutputStream(output), manifest)) {
            var entries = source.versionedStream().iterator();

            while (entries.hasNext()) {
                JarEntry entry = entries.next();

                if (entry.isDirectory())
                    continue;

                if (isNativeEntry(entry.getName()))
                    copyEntry(source, target, entry);
                else if (entry.getName().startsWith(SERVICES))
                    copyNativeProviders(source, target, entry);
            }
        }
    }

    private static void copyEntry(JarFile source, JarOutputStream target, JarEntry entry) throws IOException {
        target.putNextEntry(new JarEntry(entry.getName()));

        try (var input = source.getInputStream(entry)) {
            input.transferTo(target);
        }

        target.closeEntry();
    }

    private static void copyNativeProviders(JarFile source, JarOutputStream target, JarEntry entry) throws IOException {
        try (var input = source.getInputStream(entry)) {
            var providers = new String(input.readAllBytes(), StandardCharsets.UTF_8).lines()
                    .map(DockerNativeModule::providerName)
                    .filter(provider -> isNativeEntry(provider.replace('.', '/') + ".class"))
                    .toList();

            if (providers.isEmpty())
                return;

            target.putNextEntry(new JarEntry(entry.getName()));
            target.write(String.join("\n", providers).getBytes(StandardCharsets.UTF_8));
            target.closeEntry();
        }
    }

    private static String providerName(String line) {
        int comment = line.indexOf('#');
        return (comment < 0 ? line : line.substring(0, comment)).strip();
    }

    private static boolean isNativeEntry(String name) {
        if (!name.endsWith(".class"))
            return name.startsWith(JLINE_NATIVE + "/");

        int separator = name.lastIndexOf('/');
        return separator >= 0 && NATIVE_PACKAGES.contains(name.substring(0, separator));
    }
}
