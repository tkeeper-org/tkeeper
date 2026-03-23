# TKeeper SDK

### Maven
```xml
<dependency>
    <groupId>org.exploit</groupId>
    <artifactId>tkeeper-sdk</artifactId>
    <version>1.0.6</version>
</dependency>
```

#### Gradle
```groovy
implementation 'org.exploit:tkeeper-sdk:1.0.6'
```

## Usage
TKeeper client exposes API separated by modules:

### Creating client
First you need to define authorization instance:

#### Built-in auth mechanism
```java
var auth = new DevTokenAuth("your-dev-token");
```

```java
var auth = new JwtTokenAuth("your-jwt-token");
```

#### Specifying own auth
If you have any custom authentication mechanism, simply implement `Authorization` interface:
```java
public interface Authorization {
    default void apply(UrlBuilder urlBuilder) {}

    default void apply(Request request) {}
}
```

After creating auth instance, create the client:
```java
var client = new TKeeperClient("keeper-url", auth);
var status = client.system().status();
```