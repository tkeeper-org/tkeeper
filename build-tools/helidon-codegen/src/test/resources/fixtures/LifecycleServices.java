package fixture;

import io.helidon.service.registry.Service;

public class LifecycleServices {
    @Service.Contract
    public interface Contract {
    }

    public interface Point<P extends Point<P>> {
    }

    public static class ConcretePoint implements Point<ConcretePoint> {
    }

    @Service.Provider
    public abstract static class Base<P extends Point<P>> implements Contract {
        public int constructionCalls;
        public int cleanupCalls;

        protected Base(String algorithm) {
        }

        @Service.PostConstruct
        public void initialize() {
            constructionCalls++;
        }

        @Service.PreDestroy
        public void close() {
            cleanupCalls++;
        }
    }

    @Service.Provider
    public abstract static class Intermediate<P extends Point<P>> extends Base<P> {
        protected Intermediate(String algorithm) {
            super(algorithm);
        }
    }

    @Service.Singleton
    public static class Child extends Intermediate<ConcretePoint> {
        public Child() {
            super("fixture");
        }
    }
}
