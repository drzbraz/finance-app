import type { Model } from 'mongoose';

type Filter = Record<string, unknown>;

/**
 * Stores plain domain objects as MongoDB documents whose `_id` is the object's natural key
 * (a transaction's id, a budget's category…). Subclasses add the queries their feature needs.
 */
export abstract class DocumentRepository<T extends object, K extends keyof T> {
  protected constructor(
    protected readonly model: Model<any>,
    private readonly key: K,
  ) {}

  async findAll(filter: Filter = {}): Promise<T[]> {
    const docs = await this.model.find(filter).lean().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async findByKey(key: T[K]): Promise<T | null> {
    const doc = await this.model.findById(key).lean().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async count(filter: Filter = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  async save(entity: T): Promise<void> {
    await this.saveMany([entity]);
  }

  async saveMany(entities: T[]): Promise<void> {
    if (entities.length === 0) return;
    await this.model.bulkWrite(
      entities.map((entity) => {
        const document = this.toDocument(entity);
        return { replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true } };
      }),
    );
  }

  async deleteByKey(key: T[K]): Promise<void> {
    await this.model.deleteOne({ _id: key }).exec();
  }

  async deleteByKeys(keys: T[K][]): Promise<void> {
    if (keys.length === 0) return;
    await this.model.deleteMany({ _id: { $in: keys } }).exec();
  }

  async deleteWhere(filter: Filter): Promise<void> {
    await this.model.deleteMany(filter).exec();
  }

  async deleteAll(): Promise<void> {
    await this.deleteWhere({});
  }

  protected toEntity(doc: Record<string, unknown>): T {
    const { _id, __v, ...fields } = doc;
    return { ...fields, [this.key]: _id } as T;
  }

  protected toDocument(entity: T): Record<string, unknown> & { _id: unknown } {
    const { [this.key]: id, ...fields } = entity;
    return { _id: id, ...withoutUndefined(fields) };
  }
}

/** Optional fields left undefined are omitted rather than stored as null. */
function withoutUndefined(fields: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}
