package fixture;

import java.util.List;
import java.util.function.Supplier;

import io.helidon.service.registry.Service;

public class VarianceServices {
    @Service.Contract
    public interface Contract {
    }

    @Service.Singleton
    public static class First implements Contract {
    }

    @Service.Singleton
    public static class Second implements Contract {
    }

    @Service.Singleton
    public static class Consumer {
        public final List<Contract> ordinary;
        public final List<? extends Contract> covariant;
        public final Supplier<List<? extends Contract>> supplied;

        @Service.Inject
        public Consumer(List<Contract> ordinary,
                        List<? extends Contract> covariant,
                        Supplier<List<? extends Contract>> supplied) {
            this.ordinary = ordinary;
            this.covariant = covariant;
            this.supplied = supplied;
        }
    }

    @Service.Contract
    public interface GenericContract<T> {
    }

    @Service.Singleton
    public static class NestedConsumer {
        @Service.Inject
        public NestedConsumer(List<? extends GenericContract<? extends CharSequence>> contracts) {
        }
    }
}
