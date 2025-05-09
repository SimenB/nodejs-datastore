/*!
 * Copyright 2014 Google LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import arrify = require('arrify');
import {Key} from 'readline';
import {Datastore} from '.';
import {Entity} from './entity';
import {EntityFilter, isFilter, AllowedFilterValueType} from './filter';
import {Transaction} from './transaction';
import {CallOptions} from 'google-gax';
import {RunQueryStreamOptions} from '../src/request';
import * as gaxInstance from 'google-gax';
import {google} from '../protos/protos';

export type Operator =
  | '='
  | '<'
  | '>'
  | '<='
  | '>='
  | 'HAS_ANCESTOR'
  | '!='
  | 'IN'
  | 'NOT_IN';

export interface OrderOptions {
  descending?: boolean;
}

export interface Order {
  name: string;
  sign: '-' | '+';
}

export interface Filter {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  val: any;
  op: Operator;
}

/**
 * A Query object is used to build and execute queries for entities stored in Datastore.
 *
 * Create a Query object with {@link Datastore#createQuery} or
 * {@link Transaction#createQuery}.
 *
 * @see {@link http://goo.gl/Cag0r6| Datastore Queries}
 *
 * @class
 * @param {Datastore|Transaction} scope The parent scope the query was created
 *     from.
 * @param {string} [namespace] Namespace to query entities from.
 * @param {string[]} kinds Kind to query.
 *
 * @example
 * ```
 * const {Datastore} = require('@google-cloud/datastore');
 * const datastore = new Datastore();
 * const query = datastore.createQuery('AnimalNamespace', 'Lion');
 * ```
 */
class Query {
  scope?: Datastore | Transaction;
  namespace?: string | null;
  kinds: string[];
  filters: Filter[];
  entityFilters: EntityFilter[];
  orders: Order[];
  groupByVal: Array<{}>;
  selectVal: Array<{}>;
  startVal: string | Buffer | null;
  endVal: string | Buffer | null;
  limitVal: number;
  offsetVal: number;

  constructor(scope?: Datastore | Transaction, kinds?: string[] | null);
  constructor(
    scope?: Datastore | Transaction,
    namespace?: string | null,
    kinds?: string[],
  );
  constructor(
    scope?: Datastore | Transaction,
    namespaceOrKinds?: string | string[] | null,
    kinds?: string[],
  ) {
    let namespace = namespaceOrKinds as string | null;
    if (!kinds) {
      kinds = namespaceOrKinds as string[];
      namespace = null;
    }

    /**
     * @name Query#scope
     * @type {Datastore|Transaction}
     */
    this.scope = scope;

    /**
     * @name Query#namespace
     * @type {?string}
     */
    this.namespace = namespace || null;
    /**
     * @name Query#kinds
     * @type {string}
     */
    this.kinds = kinds;

    /**
     * @name Query#filters
     * @type {array}
     */
    this.filters = [];
    /**
     * @name Query#entityFilters
     * @type {array}
     */
    this.entityFilters = [];
    /**
     * @name Query#orders
     * @type {array}
     */
    this.orders = [];
    /**
     * @name Query#groupByVal
     * @type {array}
     */
    this.groupByVal = [];
    /**
     * @name Query#selectVal
     * @type {array}
     */
    this.selectVal = [];

    // pagination
    /**
     * @name Query#startVal
     * @type {?number}
     */
    this.startVal = null;
    /**
     * @name Query#endVal
     * @type {?number}
     */
    this.endVal = null;
    /**
     * @name Query#limitVal
     * @type {number}
     */
    this.limitVal = -1;
    /**
     * @name Query#offsetVal
     * @type {number}
     */
    this.offsetVal = -1;
  }

  /**
   * Datastore allows querying on properties. Supported comparison operators
   * are `=`, `<`, `>`, `<=`, `>=`, `!=`, `HAS_ANCESTOR`, `IN` and `NOT_IN`.
   *
   * *To filter by ancestors, see {module:datastore/query#hasAncestor}.*
   *
   * @see {@link https://cloud.google.com/datastore/docs/concepts/queries#datastore-property-filter-nodejs| Datastore Filters}
   *
   * @param {string | EntityFilter} propertyOrFilter The field name.
   * @param {string} [operator="="] Operator (=, <, >, <=, >=).
   * @param {*} value Value to compare property to.
   * @returns {Query}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const query = datastore.createQuery('Company');
   *
   * //-
   * // List all companies that are located in California.
   * //-
   * const caliQuery = query.filter('state', 'CA');
   *
   * //-
   * // List all companies named Google that have less than 400 employees.
   * //-
   * const companyQuery = query
   *   .filter('name', 'Google')
   *   .filter('size', '<', 400);
   *
   * //-
   * // To filter by key, use `__key__` for the property name. Filter on keys
   * // stored as properties is not currently supported.
   * //-
   * const key = datastore.key(['Company', 'Google']);
   * const keyQuery = query.filter('__key__', key);
   * ```
   */
  filter(filter: EntityFilter): Query;
  filter<T extends string>(
    property: T,
    value: AllowedFilterValueType<T>,
  ): Query;
  filter<T extends string>(
    property: T,
    operator: Operator,
    value: AllowedFilterValueType<T>,
  ): Query;
  filter<T extends string>(
    propertyOrFilter: T | EntityFilter,
    operatorOrValue?: Operator | AllowedFilterValueType<T>,
    value?: AllowedFilterValueType<T>,
  ): Query {
    if (arguments.length > 1) {
      gaxInstance.warn(
        'filter',
        'Providing Filter objects like Composite Filter or Property Filter is recommended when using .filter',
      );
    }
    switch (arguments.length) {
      case 1: {
        if (isFilter(propertyOrFilter)) {
          this.entityFilters.push(propertyOrFilter);
        }
        break;
      }
      case 2: {
        this.filters.push({
          name: (propertyOrFilter as String).trim(),
          op: '=',
          val: operatorOrValue as AllowedFilterValueType<T>,
        });
        break;
      }
      case 3: {
        this.filters.push({
          name: (propertyOrFilter as String).trim(),
          op: (operatorOrValue as Operator).trim() as Operator,
          val: value,
        });
      }
    }
    return this;
  }

  /**
   * Filter a query by ancestors.
   *
   * @see {@link https://cloud.google.com/datastore/docs/concepts/queries#datastore-ancestor-query-nodejs| Datastore Ancestor Filters}
   *
   * @param {Key} key Key object to filter by.
   * @returns {Query}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const query = datastore.createQuery('MyKind');
   * const ancestoryQuery = query.hasAncestor(datastore.key(['Parent', 123]));
   * ```
   */
  hasAncestor(key: Key) {
    this.filters.push({name: '__key__', op: 'HAS_ANCESTOR', val: key});
    return this;
  }

  /**
   * Sort the results by a property name in ascending or descending order. By
   * default, an ascending sort order will be used.
   *
   * @see {@link https://cloud.google.com/datastore/docs/concepts/queries#datastore-ascending-sort-nodejs| Datastore Sort Orders}
   *
   * @param {string} property The property to order by.
   * @param {object} [options] Options object.
   * @param {boolean} [options.descending=false] Sort the results by a property
   *     name in descending order.
   * @returns {Query}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const companyQuery = datastore.createQuery('Company');
   *
   * // Sort by size ascendingly.
   * const companiesAscending = companyQuery.order('size');
   *
   * // Sort by size descendingly.
   * const companiesDescending = companyQuery.order('size', {
   *   descending: true
   * });
   * ```
   */
  order(property: string, options?: OrderOptions) {
    const sign = options && options.descending ? '-' : '+';
    this.orders.push({name: property, sign});
    return this;
  }

  /**
   * Group query results by a list of properties.
   *
   * @param {array} properties Properties to group by.
   * @returns {Query}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const companyQuery = datastore.createQuery('Company');
   * const groupedQuery = companyQuery.groupBy(['name', 'size']);
   * ```
   */
  groupBy(fieldNames: string | string[]) {
    this.groupByVal = arrify(fieldNames);
    return this;
  }

  /**
   * Retrieve only select properties from the matched entities.
   *
   * Queries that select a subset of properties are called Projection Queries.
   *
   * @see {@link https://cloud.google.com/datastore/docs/samples/datastore-projection-query| Projection Queries}
   *
   * @param {string|string[]} fieldNames Properties to return from the matched
   *     entities.
   * @returns {Query}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const companyQuery = datastore.createQuery('Company');
   *
   * // Only retrieve the name property.
   * const selectQuery = companyQuery.select('name');
   *
   * // Only retrieve the name and size properties.
   * const selectQuery = companyQuery.select(['name', 'size']);
   * ```
   */
  select(fieldNames: string | string[]) {
    this.selectVal = arrify(fieldNames);
    return this;
  }

  /**
   * Set a starting cursor to a query.
   *
   * @see {@link https://cloud.google.com/datastore/docs/concepts/queries#cursors_limits_and_offsets| Query Cursors}
   *
   * @param {string} cursorToken The starting cursor token.
   * @returns {Query}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const companyQuery = datastore.createQuery('Company');
   *
   * const cursorToken = 'X';
   *
   * // Retrieve results starting from cursorToken.
   * const startQuery = companyQuery.start(cursorToken);
   * ```
   */
  start(start: string | Buffer) {
    this.startVal = start;
    return this;
  }

  /**
   * Set an ending cursor to a query.
   *
   * @see {@link https://cloud.google.com/datastore/docs/concepts/queries#Datastore_Query_cursors| Query Cursors}
   *
   * @param {string} cursorToken The ending cursor token.
   * @returns {Query}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const companyQuery = datastore.createQuery('Company');
   *
   * const cursorToken = 'X';
   *
   * // Retrieve results limited to the extent of cursorToken.
   * const endQuery = companyQuery.end(cursorToken);
   * ```
   */
  end(end: string | Buffer) {
    this.endVal = end;
    return this;
  }

  /**
   * Set a limit on a query.
   *
   * @see {@link https://cloud.google.com/datastore/docs/concepts/queries#datastore-limit-nodejs| Query Limits}
   *
   * @param {number} n The number of results to limit the query to.
   * @returns {Query}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const companyQuery = datastore.createQuery('Company');
   *
   * // Limit the results to 10 entities.
   * const limitQuery = companyQuery.limit(10);
   * ```
   */
  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  /**
   * Set an offset on a query.
   *
   * @see {@link https://cloud.google.com/datastore/docs/concepts/queries#datastore-limit-nodejs| Query Offsets}
   *
   * @param {number} n The offset to start from after the start cursor.
   * @returns {Query}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const companyQuery = datastore.createQuery('Company');
   *
   * // Start from the 101st result.
   * const offsetQuery = companyQuery.offset(100);
   * ```
   */
  offset(n: number) {
    this.offsetVal = n;
    return this;
  }

  /**
   * Run the query.
   *
   * @param {object} [options] Optional configuration.
   * @param {string} [options.consistency] Specify either `strong` or `eventual`.
   *     If not specified, default values are chosen by Datastore for the
   *     operation. Learn more about strong and eventual consistency
   *     [here](https://cloud.google.com/datastore/docs/articles/balancing-strong-and-eventual-consistency-with-google-cloud-datastore).
   * @param {object} [options.gaxOptions] Request configuration options, outlined
   *     here: https://googleapis.github.io/gax-nodejs/global.html#CallOptions.
   * @param {boolean | IntegerTypeCastOptions} [options.wrapNumbers=false]
   *     Wrap values of integerValue type in {@link Datastore#Int} objects.
   *     If a `boolean`, this will wrap values in {@link Datastore#Int} objects.
   *     If an `object`, this will return a value returned by
   *     `wrapNumbers.integerTypeCastFunction`.
   *     Please see {@link IntegerTypeCastOptions} for options descriptions.
   * @param {function} [callback] The callback function. If omitted, a readable
   *     stream instance is returned.
   * @param {?error} callback.err An error returned while making this request
   * @param {object[]} callback.entities A list of entities.
   * @param {object} callback.info An object useful for pagination.
   * @param {?string} callback.info.endCursor Use this in a follow-up query to
   *     begin from where these results ended.
   * @param {string} callback.info.moreResults Datastore responds with one of:
   *
   *     - {@link Datastore#MORE_RESULTS_AFTER_LIMIT}: There *may* be more
   *       results after the specified limit.
   *     - {@link Datastore#MORE_RESULTS_AFTER_CURSOR}: There *may* be more
   *       results after the specified end cursor.
   *     - {@link Datastore#NO_MORE_RESULTS}: There are no more results.
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const query = datastore.createQuery('Company');
   *
   * query.run((err, entities, info) => {
   *   // entities = An array of records.
   *
   *   // Access the Key object for an entity.
   *   const firstEntityKey = entities[0][datastore.KEY];
   * });
   *
   * //-
   * // A keys-only query returns just the keys of the result entities instead
   * of
   * // the entities themselves, at lower latency and cost.
   * //-
   * query.select('__key__');
   *
   * query.run((err, entities) => {
   *   const keys = entities.map((entity) => {
   *     return entity[datastore.KEY];
   *   });
   * });
   *
   * //-
   * // If the callback is omitted, we'll return a Promise.
   * //-
   * query.run().then((data) => {
   *   const entities = data[0];
   * });
   * ```
   */
  run(options?: RunQueryOptions): Promise<RunQueryResponse>;
  run(options: RunQueryOptions, callback: RunQueryCallback): void;
  run(callback: RunQueryCallback): void;
  run(
    optionsOrCallback?: RunQueryOptions | RunQueryCallback,
    cb?: RunQueryCallback,
  ): void | Promise<RunQueryResponse> {
    const options =
      typeof optionsOrCallback === 'object' ? optionsOrCallback : {};
    const callback =
      typeof optionsOrCallback === 'function' ? optionsOrCallback : cb!;
    const runQuery = this.scope!.runQuery.bind(this.scope);
    return runQuery(this, options, callback);
  }

  /**
   * Run the query as a readable object stream.
   *
   * @method Query#runStream
   * @param {object} [options] Optional configuration. See
   *     {@link Query#run} for a complete list of options.
   * @returns {stream}
   *
   * @example
   * ```
   * const {Datastore} = require('@google-cloud/datastore');
   * const datastore = new Datastore();
   * const query = datastore.createQuery('Company');
   *
   * query.runStream()
   *   .on('error', console.error)
   *   .on('data', function (entity) {
   *     // Access the Key object for this entity.
   *     const key = entity[datastore.KEY];
   *   })
   *   .on('info', (info) => {})
   *   .on('end', () => {
   *     // All entities retrieved.
   *   });
   *
   * //-
   * // If you anticipate many results, you can end a stream early to prevent
   * // unnecessary processing and API requests.
   * //-
   * query.runStream()
   *   .on('data', function (entity) {
   *     this.end();
   *   });
   * ```
   */
  runStream(options?: RunQueryStreamOptions) {
    return this.scope!.runQueryStream(this, options);
  }
}

export interface QueryProto {
  startCursor?: string | Buffer;
  distinctOn: {};
  kind: {};
  order: {};
  projection: {};
  endCursor?: string | Buffer;
  limit?: {};
  offset?: number;
  filter?: {};
}

/**
 * Reference to the {@link Query} class.
 * @name module:@google-cloud/datastore.Query
 * @see Query
 */
export {Query};

export interface IntegerTypeCastOptions {
  integerTypeCastFunction: Function;
  properties?: string | string[];
}

export interface ExplainOptions {
  analyze?: boolean;
}

export interface RunQueryOptions {
  consistency?: 'strong' | 'eventual';
  readTime?: number;
  gaxOptions?: CallOptions;
  explainOptions?: ExplainOptions;
  wrapNumbers?: boolean | IntegerTypeCastOptions;
}

export interface RunQueryCallback {
  (err: Error | null, entities?: Entity[], info?: RunQueryInfo): void;
}

export type RunQueryResponse = [Entity[], RunQueryInfo];

export type RunAggregateQueryResponse = any;

export interface RunQueryInfo {
  endCursor?: string;
  moreResults?:
    | 'MORE_RESULTS_TYPE_UNSPECIFIED'
    | 'NOT_FINISHED'
    | 'MORE_RESULTS_AFTER_LIMIT'
    | 'MORE_RESULTS_AFTER_CURSOR'
    | 'NO_MORE_RESULTS';
  explainMetrics?: ExplainMetrics;
}

export interface ExplainMetrics {
  planSummary?: PlanSummary;
  executionStats?: ExecutionStats;
}
export interface ExecutionStats {
  resultsReturned?: number;
  executionDuration?: google.protobuf.IDuration;
  readOperations?: number;
  debugStats?: {
    [key: string]: any;
  };
}

export interface PlanSummary {
  indexesUsed: {
    [key: string]: any;
  }[];
}
