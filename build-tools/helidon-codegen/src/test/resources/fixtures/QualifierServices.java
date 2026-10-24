package fixture;

import io.helidon.service.registry.Service;

public class QualifierServices {
    @Service.Contract
    public interface Contract {
    }

    @Service.Singleton
    @Service.Named("first")
    public static class First implements Contract {
    }

    @Service.Singleton
    @Service.Named("second")
    public static class Second implements Contract {
    }

    @Service.Singleton
    public static class Consumer {
        public final Contract selected;

        @Service.Inject
        public Consumer(@Service.Named("second") Contract selected) {
            this.selected = selected;
        }
    }
}
