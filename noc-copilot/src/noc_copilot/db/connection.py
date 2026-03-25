"""MongoDB connection manager for sync and async clients."""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
from pymongo.database import Database

from noc_copilot.config import get_settings


class MongoDBConnection:
    """Manages both sync and async MongoDB connections."""

    _sync_client: MongoClient | None = None
    _async_client: AsyncIOMotorClient | None = None

    @classmethod
    def get_sync_client(cls) -> MongoClient:
        if cls._sync_client is None:
            settings = get_settings()
            cls._sync_client = MongoClient(settings.mongodb_uri)
        return cls._sync_client

    @classmethod
    def get_async_client(cls) -> AsyncIOMotorClient:
        if cls._async_client is None:
            settings = get_settings()
            cls._async_client = AsyncIOMotorClient(settings.mongodb_uri)
        return cls._async_client

    @classmethod
    def get_sync_db(cls) -> Database:
        settings = get_settings()
        return cls.get_sync_client()[settings.mongodb_database]

    @classmethod
    def get_async_db(cls) -> AsyncIOMotorDatabase:
        settings = get_settings()
        return cls.get_async_client()[settings.mongodb_database]

    @classmethod
    def close(cls) -> None:
        if cls._sync_client is not None:
            cls._sync_client.close()
            cls._sync_client = None
        if cls._async_client is not None:
            cls._async_client.close()
            cls._async_client = None
