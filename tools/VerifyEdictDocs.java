import com.fasterxml.jackson.databind.ObjectMapper;
import org.exploit.edict.model.value.Value;
import org.exploit.keeper.factory.PolicyEngineFactory;
import org.exploit.keeper.service.command.intent.IntentBuilder;
import org.exploit.keeper.service.command.intent.TypedIntentBuilder;
import org.exploit.keeper.util.authority.AuthorityValues;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

public class VerifyEdictDocs {
    private static final Pattern POLICY_BLOCK = Pattern.compile("```edict\\R");
    private static final List<String> BUILDERS = List.of(
            "org.exploit.keeper.authority.bitcoin.intent.BitcoinTransactionIntentBuilder",
            "org.exploit.keeper.authority.evm.intent.EvmIntentBuilder",
            "org.exploit.keeper.authority.evm.intent.Evm7702IntentBuilder",
            "org.exploit.keeper.authority.evm.intent.Evm2612IntentBuilder",
            "org.exploit.keeper.authority.evm.intent.Evm3009IntentBuilder",
            "org.exploit.keeper.authority.tron.intent.TronIntentBuilder",
            "org.exploit.keeper.authority.xrp.intent.XrpIntentBuilder",
            "org.exploit.keeper.authority.solana.intent.SolanaIntentBuilder",
            "org.exploit.keeper.authority.xlm.intent.XlmIntentBuilder",
            "org.exploit.keeper.authority.x509.intent.X509TBSCertificateIntentBuilder",
            "org.exploit.keeper.payment.ap2.intent.Ap2IntentBuilder",
            "org.exploit.keeper.payment.mcvi.intent.McIntentBuilder");

    public static void main(String[] args) throws Exception {
        var builders = new ArrayList<IntentBuilder>();
        builders.add(new TypedIntentBuilder(new ObjectMapper()));
        for (var name : BUILDERS) {
            builders.add((IntentBuilder) Class.forName(name).getConstructor().newInstance());
        }
        var engine = new PolicyEngineFactory(builders).policyEvaluator();
        var remaining = new HashSet<>(builders.stream().map(IntentBuilder::type).toList());
        var checked = 0;
        try (var paths = Files.walk(Path.of(args[0], "docs"))) {
            for (var path : paths.filter(p -> p.toString().endsWith(".md")).sorted().toList()) {
                checked += check(path, builders, engine, remaining);
            }
        }
        if (!remaining.isEmpty()) {
            throw new AssertionError("Missing complete Edict documentation examples for " + remaining);
        }
        System.out.println("Compiled " + checked + " complete Edict documentation examples");
    }

    private static int check(Path path, List<IntentBuilder> builders, org.exploit.edict.Edict engine,
                             Set<String> remaining) throws Exception {
        var checked = 0;
        for (var part : POLICY_BLOCK.split(Files.readString(path), -1)) {
            var end = part.indexOf("```");
            if (end < 0) {
                continue;
            }
            var source = part.substring(0, end).strip();
            if (!source.startsWith("authority ") && !source.startsWith("language ")) {
                continue;
            }
            try {
                var metadata = engine.inspect(source);
                var intent = ((Value.Text) metadata.properties().fields().get("intent")).value();
                var builder = builders.stream().filter(b -> b.type().equals(intent)).findFirst().orElseThrow();
                var config = AuthorityValues.INSTANCE.map(metadata.config());
                builder.validateConfig(config);
                builder.validateCompiled(engine.compile(source, builder.contract(config, metadata)));
                remaining.remove(intent);
                checked++;
            } catch (Exception failure) {
                throw new IllegalStateException("Invalid Edict example in " + path, failure);
            }
        }
        return checked;
    }
}
