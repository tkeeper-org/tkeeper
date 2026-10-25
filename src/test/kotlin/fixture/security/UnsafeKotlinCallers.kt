package fixture.security

import org.exploit.keeper.service.db.RocksKeyDB

class KotlinDirectCaller {
    fun invoke(db: RocksKeyDB) = db.migrateIntegrityKeys(emptyMap())
}

class KotlinReferenceCaller {
    fun reference(db: RocksKeyDB): (Map<Int, ByteArray>) -> Unit = db::migrateIntegrityKeys
}

class KotlinDefaultCaller {
    fun invoke(db: RocksKeyDB) = db.writeIntegrityKey(Byte.MIN_VALUE, byteArrayOf(), byteArrayOf())
}
