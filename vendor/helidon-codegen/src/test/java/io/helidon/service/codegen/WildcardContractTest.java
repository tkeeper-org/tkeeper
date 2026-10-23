package io.helidon.service.codegen;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import javax.tools.DiagnosticCollector;
import javax.tools.JavaFileObject;
import javax.tools.ToolProvider;

import io.helidon.service.registry.Dependency;
import io.helidon.service.registry.ServiceDescriptor;
import io.helidon.service.registry.ServiceRegistryConfig;
import io.helidon.service.registry.ServiceRegistryManager;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WildcardContractTest {
    @TempDir
    Path temporary;

    @Test
    void generatedDescriptorsCompileAndInjectTheSameServicesForCovariantLists() throws Exception {
        var diagnostics = new DiagnosticCollector<JavaFileObject>();
        String source;
        try (var resource = getClass().getResourceAsStream("/fixtures/VarianceServices.java")) {
            source = new String(resource.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }

        String moduleName = temporary.getFileName().toString();
        assertTrue(compile("VarianceServices", source, diagnostics,
                           "-Ahelidon.registry.moduleName=" + moduleName,
                           "-Akapt.kotlin.generated=" + temporary.resolve("kotlin")),
                   diagnostics.getDiagnostics().toString());
        assertTrue(diagnostics.getDiagnostics().isEmpty(), diagnostics.getDiagnostics().toString());

        Path metadata = temporary.resolve("classes/META-INF/helidon/" + moduleName + "/service-registry.json");
        assertTrue(Files.exists(metadata));
        assertTrue(Files.readString(metadata).contains("\"module\":\"" + moduleName + "\""));

        try (var loader = new URLClassLoader(new URL[] {temporary.resolve("classes").toUri().toURL()},
                                            getClass().getClassLoader())) {
            assertCovariantSingletonInjection(loader);
            assertNestedWildcardRetained(loader);
        }
    }

    @Test
    void inheritedLifecycleClosesOnceWithoutCreatingAbstractProviders() throws Exception {
        var diagnostics = new DiagnosticCollector<JavaFileObject>();
        String source;
        try (var resource = getClass().getResourceAsStream("/fixtures/LifecycleServices.java")) {
            source = new String(resource.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }

        assertTrue(compile("LifecycleServices", source, diagnostics), diagnostics.getDiagnostics().toString());

        try (var loader = new URLClassLoader(new URL[] {temporary.resolve("classes").toUri().toURL()},
                                            getClass().getClassLoader())) {
            assertInheritedLifecycle(loader);
        }
    }

    private void assertInheritedLifecycle(ClassLoader loader) throws ReflectiveOperationException {
        ServiceDescriptor<?> childDescriptor = descriptor(loader, "LifecycleServices", "Child");
        assertTrue(childDescriptor.dependencies().isEmpty());

        var config = ServiceRegistryConfig.builder()
                .discoverServices(false)
                .discoverServicesFromServiceLoader(false)
                .addServiceDescriptor(descriptor(loader, "LifecycleServices", "Base"))
                .addServiceDescriptor(descriptor(loader, "LifecycleServices", "Intermediate"))
                .addServiceDescriptor(childDescriptor)
                .build();
        var manager = ServiceRegistryManager.create(config);
        Class<?> contract = loader.loadClass("fixture.LifecycleServices$Contract");
        Class<?> childType = loader.loadClass("fixture.LifecycleServices$Child");
        Object child;

        try {
            child = manager.registry().get(childType);
            assertEquals(List.of(child), manager.registry().all(contract));
            assertEquals(1, childType.getField("constructionCalls").getInt(child));
            assertEquals(0, childType.getField("cleanupCalls").getInt(child));
        } finally {
            manager.shutdown();
        }

        assertEquals(1, childType.getField("cleanupCalls").getInt(child));
        manager.shutdown();
        assertEquals(1, childType.getField("cleanupCalls").getInt(child));
    }

    private void assertCovariantSingletonInjection(ClassLoader loader) throws ReflectiveOperationException {
        var config = ServiceRegistryConfig.builder()
                .discoverServices(false)
                .discoverServicesFromServiceLoader(false)
                .addServiceDescriptor(descriptor(loader, "First"))
                .addServiceDescriptor(descriptor(loader, "Second"))
                .addServiceDescriptor(descriptor(loader, "Consumer"))
                .build();
        var manager = ServiceRegistryManager.create(config);

        try {
            Class<?> consumerType = loader.loadClass("fixture.VarianceServices$Consumer");
            Object consumer = manager.registry().get(consumerType);
            List<?> ordinary = (List<?>) consumerType.getField("ordinary").get(consumer);
            List<?> covariant = (List<?>) consumerType.getField("covariant").get(consumer);
            Supplier<?> supplied = (Supplier<?>) consumerType.getField("supplied").get(consumer);

            assertEquals(2, ordinary.size());
            assertSameInstances(ordinary, covariant);
            assertSameInstances(ordinary, (List<?>) supplied.get());
        } finally {
            manager.shutdown();
        }
    }

    private void assertSameInstances(List<?> expected, List<?> actual) {
        assertEquals(expected, actual);
        for (int index = 0; index < expected.size(); index++) {
            assertSame(expected.get(index), actual.get(index));
        }
    }

    private void assertNestedWildcardRetained(ClassLoader loader) throws ReflectiveOperationException {
        Dependency nested = descriptor(loader, "NestedConsumer").dependencies().getFirst();
        assertEquals("fixture.VarianceServices.GenericContract<? extends java.lang.CharSequence>",
                     nested.contract().resolvedName());
        assertTrue(nested.contractType().type().getTypeName().contains("? extends java.lang.CharSequence"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"?", "? super Runnable"})
    void unsupportedWildcardContractFailsAtCompileTime(String wildcard) throws IOException {
        String source = """
                package fixture;
                import java.util.List;
                import io.helidon.service.registry.Service;
                @Service.Singleton
                public class InvalidService {
                    @Service.Inject
                    public InvalidService(List<%s> services) {}
                }
                """.formatted(wildcard);
        var diagnostics = new DiagnosticCollector<JavaFileObject>();

        assertFalse(compile("InvalidService", source, diagnostics));
        assertTrue(diagnostics.getDiagnostics().stream()
                           .anyMatch(it -> it.getMessage(java.util.Locale.ROOT)
                                   .contains("wildcard must declare one extends bound")),
                   diagnostics.getDiagnostics().toString());
    }

    private boolean compile(String className,
                            String source,
                            DiagnosticCollector<JavaFileObject> diagnostics,
                            String... processorOptions) throws IOException {
        Path sourceFile = temporary.resolve(className + ".java");
        Files.writeString(sourceFile, source);
        Path classes = Files.createDirectories(temporary.resolve("classes"));
        Path generated = Files.createDirectories(temporary.resolve("generated"));
        String classpath = System.getProperty("codegen.test.classpath");

        var compiler = ToolProvider.getSystemJavaCompiler();
        try (var files = compiler.getStandardFileManager(diagnostics, null, null)) {
            var options = new ArrayList<>(List.of(
                    "--release", "25", "-classpath", classpath, "-processorpath", classpath,
                    "-processor", "io.helidon.codegen.apt.AptProcessor",
                    "-d", classes.toString(), "-s", generated.toString()));
            options.addAll(List.of(processorOptions));

            return compiler.getTask(null, files, diagnostics, options, null,
                                    files.getJavaFileObjects(sourceFile)).call();
        }
    }

    private ServiceDescriptor<?> descriptor(ClassLoader loader, String nestedType) throws ReflectiveOperationException {
        return descriptor(loader, "VarianceServices", nestedType);
    }

    private ServiceDescriptor<?> descriptor(ClassLoader loader, String enclosingType, String nestedType)
            throws ReflectiveOperationException {
        Class<?> type = loader.loadClass("fixture." + enclosingType + "_" + nestedType + "__ServiceDescriptor");
        return (ServiceDescriptor<?>) type.getField("INSTANCE").get(null);
    }
}
