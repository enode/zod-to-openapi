"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAPIGenerator = void 0;
const errors_1 = require("./errors");
const enum_info_1 = require("./lib/enum-info");
const lodash_1 = require("./lib/lodash");
const zod_is_type_1 = require("./lib/zod-is-type");
// List of Open API Versions. Please make sure these are in ascending order
const openApiVersions = ['3.0.0', '3.0.1', '3.0.2', '3.0.3', '3.1.0'];
class OpenAPIGenerator {
    constructor(definitions, versionSpecifics) {
        this.definitions = definitions;
        this.versionSpecifics = versionSpecifics;
        this.schemaRefs = {};
        this.paramRefs = {};
        this.pathRefs = {};
        this.rawComponents = [];
        this.sortDefinitions();
    }
    generateDocumentData() {
        this.definitions.forEach(definition => this.generateSingle(definition));
        return {
            components: this.buildComponents(),
            paths: this.pathRefs,
        };
    }
    generateComponents() {
        this.definitions.forEach(definition => this.generateSingle(definition));
        return {
            components: this.buildComponents(),
        };
    }
    buildComponents() {
        var _a, _b;
        const rawComponents = {};
        this.rawComponents.forEach(({ componentType, name, component }) => {
            var _a;
            (_a = rawComponents[componentType]) !== null && _a !== void 0 ? _a : (rawComponents[componentType] = {});
            rawComponents[componentType][name] = component;
        });
        return Object.assign(Object.assign({}, rawComponents), { schemas: Object.assign(Object.assign({}, ((_a = rawComponents.schemas) !== null && _a !== void 0 ? _a : {})), this.schemaRefs), parameters: Object.assign(Object.assign({}, ((_b = rawComponents.parameters) !== null && _b !== void 0 ? _b : {})), this.paramRefs) });
    }
    sortDefinitions() {
        const generationOrder = [
            'schema',
            'parameter',
            'component',
            'route',
        ];
        this.definitions.sort((left, right) => {
            // No type means "plain zod schema" => it comes as highest priority based on the array above
            if (!('type' in left)) {
                if (!('type' in right)) {
                    return 0;
                }
                return -1;
            }
            if (!('type' in right)) {
                return 1;
            }
            const leftIndex = generationOrder.findIndex(type => type === left.type);
            const rightIndex = generationOrder.findIndex(type => type === right.type);
            return leftIndex - rightIndex;
        });
    }
    generateSingle(definition) {
        if (!('type' in definition)) {
            this.generateSchema(definition);
            return;
        }
        switch (definition.type) {
            case 'parameter':
                this.generateParameterDefinition(definition.schema);
                return;
            case 'schema':
                this.generateSchema(definition.schema);
                return;
            case 'route':
                this.generateSingleRoute(definition.route);
                return;
            case 'component':
                this.rawComponents.push(definition);
                return;
        }
    }
    generateParameterDefinition(zodSchema) {
        const refId = this.getRefId(zodSchema);
        const result = this.generateParameter(zodSchema);
        if (refId) {
            this.paramRefs[refId] = result;
        }
        return result;
    }
    getParameterRef(schemaMetadata, external) {
        var _a, _b, _c, _d, _e;
        const parameterMetadata = (_a = schemaMetadata === null || schemaMetadata === void 0 ? void 0 : schemaMetadata.metadata) === null || _a === void 0 ? void 0 : _a.param;
        const existingRef = ((_b = schemaMetadata === null || schemaMetadata === void 0 ? void 0 : schemaMetadata._internal) === null || _b === void 0 ? void 0 : _b.refId)
            ? this.paramRefs[(_c = schemaMetadata._internal) === null || _c === void 0 ? void 0 : _c.refId]
            : undefined;
        if (!((_d = schemaMetadata === null || schemaMetadata === void 0 ? void 0 : schemaMetadata._internal) === null || _d === void 0 ? void 0 : _d.refId) || !existingRef) {
            return undefined;
        }
        if ((parameterMetadata && existingRef.in !== parameterMetadata.in) ||
            ((external === null || external === void 0 ? void 0 : external.in) && existingRef.in !== external.in)) {
            throw new errors_1.ConflictError(`Conflicting location for parameter ${existingRef.name}`, {
                key: 'in',
                values: (0, lodash_1.compact)([
                    existingRef.in,
                    external === null || external === void 0 ? void 0 : external.in,
                    parameterMetadata === null || parameterMetadata === void 0 ? void 0 : parameterMetadata.in,
                ]),
            });
        }
        if ((parameterMetadata && existingRef.name !== parameterMetadata.name) ||
            ((external === null || external === void 0 ? void 0 : external.name) && existingRef.name !== (external === null || external === void 0 ? void 0 : external.name))) {
            throw new errors_1.ConflictError(`Conflicting names for parameter`, {
                key: 'name',
                values: (0, lodash_1.compact)([
                    existingRef.name,
                    external === null || external === void 0 ? void 0 : external.name,
                    parameterMetadata === null || parameterMetadata === void 0 ? void 0 : parameterMetadata.name,
                ]),
            });
        }
        return {
            $ref: `#/components/parameters/${(_e = schemaMetadata._internal) === null || _e === void 0 ? void 0 : _e.refId}`,
        };
    }
    generateInlineParameters(zodSchema, location) {
        var _a;
        const metadata = this.getMetadata(zodSchema);
        const parameterMetadata = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.metadata) === null || _a === void 0 ? void 0 : _a.param;
        const referencedSchema = this.getParameterRef(metadata, { in: location });
        if (referencedSchema) {
            return [referencedSchema];
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodObject')) {
            const propTypes = zodSchema._def.shape();
            const parameters = Object.entries(propTypes).map(([key, schema]) => {
                var _a, _b;
                const innerMetadata = this.getMetadata(schema);
                const referencedSchema = this.getParameterRef(innerMetadata, {
                    in: location,
                    name: key,
                });
                if (referencedSchema) {
                    return referencedSchema;
                }
                const innerParameterMetadata = (_a = innerMetadata === null || innerMetadata === void 0 ? void 0 : innerMetadata.metadata) === null || _a === void 0 ? void 0 : _a.param;
                if ((innerParameterMetadata === null || innerParameterMetadata === void 0 ? void 0 : innerParameterMetadata.name) &&
                    innerParameterMetadata.name !== key) {
                    throw new errors_1.ConflictError(`Conflicting names for parameter`, {
                        key: 'name',
                        values: [key, innerParameterMetadata.name],
                    });
                }
                if ((innerParameterMetadata === null || innerParameterMetadata === void 0 ? void 0 : innerParameterMetadata.in) &&
                    innerParameterMetadata.in !== location) {
                    throw new errors_1.ConflictError(`Conflicting location for parameter ${(_b = innerParameterMetadata.name) !== null && _b !== void 0 ? _b : key}`, {
                        key: 'in',
                        values: [location, innerParameterMetadata.in],
                    });
                }
                return this.generateParameter(schema.openapi({ param: { name: key, in: location } }));
            });
            return parameters;
        }
        if ((parameterMetadata === null || parameterMetadata === void 0 ? void 0 : parameterMetadata.in) && parameterMetadata.in !== location) {
            throw new errors_1.ConflictError(`Conflicting location for parameter ${parameterMetadata.name}`, {
                key: 'in',
                values: [location, parameterMetadata.in],
            });
        }
        return [
            this.generateParameter(zodSchema.openapi({ param: { in: location } })),
        ];
    }
    generateSimpleParameter(zodSchema) {
        var _a;
        const metadata = this.getParamMetadata(zodSchema);
        const paramMetadata = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.metadata) === null || _a === void 0 ? void 0 : _a.param;
        const required = !this.isOptionalSchema(zodSchema) && !zodSchema.isNullable();
        const schema = this.generateSchemaWithRef(zodSchema);
        return Object.assign({ schema,
            required }, (paramMetadata ? this.buildParameterMetadata(paramMetadata) : {}));
    }
    generateParameter(zodSchema) {
        var _a;
        const metadata = this.getMetadata(zodSchema);
        const paramMetadata = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.metadata) === null || _a === void 0 ? void 0 : _a.param;
        const paramName = paramMetadata === null || paramMetadata === void 0 ? void 0 : paramMetadata.name;
        const paramLocation = paramMetadata === null || paramMetadata === void 0 ? void 0 : paramMetadata.in;
        if (!paramName) {
            throw new errors_1.MissingParameterDataError({ missingField: 'name' });
        }
        if (!paramLocation) {
            throw new errors_1.MissingParameterDataError({
                missingField: 'in',
                paramName,
            });
        }
        const baseParameter = this.generateSimpleParameter(zodSchema);
        return Object.assign(Object.assign({}, baseParameter), { in: paramLocation, name: paramName });
    }
    generateSchemaWithMetadata(zodSchema) {
        var _a;
        const innerSchema = this.unwrapChained(zodSchema);
        const metadata = this.getMetadata(zodSchema);
        const defaultValue = this.getDefaultValue(zodSchema);
        const result = ((_a = metadata === null || metadata === void 0 ? void 0 : metadata.metadata) === null || _a === void 0 ? void 0 : _a.type)
            ? { type: metadata === null || metadata === void 0 ? void 0 : metadata.metadata.type }
            : this.toOpenAPISchema(innerSchema, zodSchema.isNullable(), defaultValue);
        return (metadata === null || metadata === void 0 ? void 0 : metadata.metadata)
            ? this.applySchemaMetadata(result, metadata.metadata)
            : (0, lodash_1.omitBy)(result, lodash_1.isNil);
    }
    /**
     * Generates an OpenAPI SchemaObject or a ReferenceObject with all the provided metadata applied
     */
    generateSimpleSchema(zodSchema) {
        var _a;
        const metadata = this.getMetadata(zodSchema);
        const refId = this.getRefId(zodSchema);
        if (!refId || !this.schemaRefs[refId]) {
            return this.generateSchemaWithMetadata(zodSchema);
        }
        const schemaRef = this.schemaRefs[refId];
        const referenceObject = {
            $ref: this.generateSchemaRef(refId),
        };
        // Metadata provided from .openapi() that is new to what we had already registered
        const newMetadata = (0, lodash_1.omitBy)(this.buildSchemaMetadata((_a = metadata === null || metadata === void 0 ? void 0 : metadata.metadata) !== null && _a !== void 0 ? _a : {}), (value, key) => value === undefined || (0, lodash_1.objectEquals)(value, schemaRef[key]));
        // Do not calculate schema metadata overrides if type is provided in .openapi
        // https://github.com/asteasolutions/zod-to-openapi/pull/52/files/8ff707fe06e222bc573ed46cf654af8ee0b0786d#r996430801
        if (newMetadata.type) {
            return {
                allOf: [referenceObject, newMetadata],
            };
        }
        // New metadata from ZodSchema properties.
        const newSchemaMetadata = (0, lodash_1.omitBy)(this.constructReferencedOpenAPISchema(zodSchema), (value, key) => value === undefined || (0, lodash_1.objectEquals)(value, schemaRef[key]));
        const appliedMetadata = this.applySchemaMetadata(newSchemaMetadata, newMetadata);
        if (Object.keys(appliedMetadata).length > 0) {
            return {
                allOf: [referenceObject, appliedMetadata],
            };
        }
        return referenceObject;
    }
    /**
     * Generates a whole OpenApi schema and saves it into
     * schemaRefs if a `refId` is provided.
     */
    generateSchema(zodSchema) {
        const refId = this.getRefId(zodSchema);
        const result = this.generateSimpleSchema(zodSchema);
        if (refId && this.schemaRefs[refId] === undefined) {
            this.schemaRefs[refId] = result;
        }
        return result;
    }
    /**
     * Same as `generateSchema` but if the new schema is added into the
     * referenced schemas, it would return a ReferenceObject and not the
     * whole result.
     *
     * Should be used for nested objects, arrays, etc.
     */
    generateSchemaWithRef(zodSchema) {
        const refId = this.getRefId(zodSchema);
        const result = this.generateSimpleSchema(zodSchema);
        if (refId && this.schemaRefs[refId] === undefined) {
            this.schemaRefs[refId] = result;
            return { $ref: this.generateSchemaRef(refId) };
        }
        return result;
    }
    generateSchemaRef(refId) {
        return `#/components/schemas/${refId}`;
    }
    getRequestBody(requestBody) {
        if (!requestBody) {
            return;
        }
        const { content } = requestBody, rest = __rest(requestBody, ["content"]);
        const requestBodyContent = this.getBodyContent(content);
        return Object.assign(Object.assign({}, rest), { content: requestBodyContent });
    }
    getParameters(request) {
        if (!request) {
            return [];
        }
        const { query, params, headers, cookies } = request;
        const queryParameters = this.enhanceMissingParametersError(() => (query ? this.generateInlineParameters(query, 'query') : []), { location: 'query' });
        const pathParameters = this.enhanceMissingParametersError(() => (params ? this.generateInlineParameters(params, 'path') : []), { location: 'path' });
        const cookieParameters = this.enhanceMissingParametersError(() => (cookies ? this.generateInlineParameters(cookies, 'cookie') : []), { location: 'cookie' });
        const headerParameters = this.enhanceMissingParametersError(() => headers
            ? (0, zod_is_type_1.isZodType)(headers, 'ZodObject')
                ? this.generateInlineParameters(headers, 'header')
                : headers.flatMap(header => this.generateInlineParameters(header, 'header'))
            : [], { location: 'header' });
        return [
            ...pathParameters,
            ...queryParameters,
            ...headerParameters,
            ...cookieParameters,
        ];
    }
    generatePath(route) {
        const { method, path, request, responses } = route, pathItemConfig = __rest(route, ["method", "path", "request", "responses"]);
        const generatedResponses = (0, lodash_1.mapValues)(responses, response => {
            return this.getResponse(response);
        });
        const parameters = this.enhanceMissingParametersError(() => this.getParameters(request), { route: `${method} ${path}` });
        const requestBody = this.getRequestBody(request === null || request === void 0 ? void 0 : request.body);
        const routeDoc = {
            [method]: Object.assign(Object.assign(Object.assign(Object.assign({}, pathItemConfig), (parameters.length > 0
                ? {
                    parameters: [...(pathItemConfig.parameters || []), ...parameters],
                }
                : {})), (requestBody ? { requestBody } : {})), { responses: generatedResponses }),
        };
        return routeDoc;
    }
    generateSingleRoute(route) {
        const routeDoc = this.generatePath(route);
        this.pathRefs[route.path] = Object.assign(Object.assign({}, this.pathRefs[route.path]), routeDoc);
        return routeDoc;
    }
    getResponse(_a) {
        var { content, headers } = _a, rest = __rest(_a, ["content", "headers"]);
        const responseContent = content
            ? { content: this.getBodyContent(content) }
            : {};
        if (!headers) {
            return Object.assign(Object.assign({}, rest), responseContent);
        }
        const responseHeaders = (0, zod_is_type_1.isZodType)(headers, 'ZodObject')
            ? this.getResponseHeaders(headers)
            : // This is input data so it is okay to cast in the common generator
                // since this is the user's responsibility to keep it correct
                headers;
        return Object.assign(Object.assign(Object.assign({}, rest), { headers: responseHeaders }), responseContent);
    }
    getResponseHeaders(headers) {
        const schemaShape = headers._def.shape();
        const responseHeaders = (0, lodash_1.mapValues)(schemaShape, _ => this.generateSimpleParameter(_));
        return responseHeaders;
    }
    getBodyContent(content) {
        return (0, lodash_1.mapValues)(content, config => {
            if (!(0, zod_is_type_1.isAnyZodType)(config.schema)) {
                return config;
            }
            const { schema: configSchema } = config, rest = __rest(config, ["schema"]);
            const schema = this.generateSchemaWithRef(configSchema);
            return Object.assign({ schema }, rest);
        });
    }
    getZodStringCheck(zodString, kind) {
        return zodString._def.checks.find((check) => {
            return check.kind === kind;
        });
    }
    /**
     * Attempts to map Zod strings to known formats
     * https://json-schema.org/understanding-json-schema/reference/string.html#built-in-formats
     */
    mapStringFormat(zodString) {
        if (zodString.isUUID) {
            return 'uuid';
        }
        if (zodString.isEmail) {
            return 'email';
        }
        if (zodString.isURL) {
            return 'uri';
        }
        if (zodString.isDatetime) {
            return 'date-time';
        }
        return undefined;
    }
    mapDiscriminator(zodObjects, discriminator) {
        // All schemas must be registered to use a discriminator
        if (zodObjects.some(obj => this.getRefId(obj) === undefined)) {
            return undefined;
        }
        const mapping = {};
        zodObjects.forEach(obj => {
            var _a;
            const refId = this.getRefId(obj); // type-checked earlier
            const value = (_a = obj.shape) === null || _a === void 0 ? void 0 : _a[discriminator];
            if ((0, zod_is_type_1.isZodType)(obj, 'ZodDiscriminatedUnion')) {
                const childValues = obj._enforceParentDiscriminator(discriminator);
                if (childValues.length !== 1) {
                    throw new Error(`Evaluating ${discriminator}: Only one child discriminator value supported, got ${childValues}`);
                }
                mapping[String(childValues[0])] = this.generateSchemaRef(refId);
                return;
            }
            if ((0, zod_is_type_1.isZodType)(value, 'ZodEnum')) {
                value._def.values.forEach((enumValue) => {
                    mapping[enumValue] = this.generateSchemaRef(refId);
                });
                return;
            }
            const literalValue = value === null || value === void 0 ? void 0 : value._def.value;
            // This should never happen because Zod checks the disciminator type but to keep the types happy
            if (typeof literalValue !== 'string') {
                throw new Error(`Discriminator ${discriminator} could not be found in one of the values of a discriminated union`);
            }
            mapping[literalValue] = this.generateSchemaRef(refId);
        });
        return {
            propertyName: discriminator,
            mapping,
        };
    }
    mapNullableOfArray(objects, isNullable) {
        return this.versionSpecifics.mapNullableOfArray(objects, isNullable);
    }
    mapNullableType(type, isNullable) {
        return this.versionSpecifics.mapNullableType(type, isNullable);
    }
    getNumberChecks(checks) {
        return this.versionSpecifics.getNumberChecks(checks);
    }
    constructReferencedOpenAPISchema(zodSchema) {
        var _a;
        const metadata = this.getMetadata(zodSchema);
        const innerSchema = this.unwrapChained(zodSchema);
        const defaultValue = this.getDefaultValue(zodSchema);
        const isNullableSchema = zodSchema.isNullable();
        if ((_a = metadata === null || metadata === void 0 ? void 0 : metadata.metadata) === null || _a === void 0 ? void 0 : _a.type) {
            return this.mapNullableType(metadata.metadata.type, isNullableSchema);
        }
        return this.toOpenAPISchema(innerSchema, isNullableSchema, defaultValue);
    }
    toOpenAPISchema(zodSchema, isNullable, defaultValue) {
        var _a, _b, _c, _d, _e;
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodNull')) {
            return this.versionSpecifics.nullType;
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodString')) {
            const regexCheck = this.getZodStringCheck(zodSchema, 'regex');
            const length = (_a = this.getZodStringCheck(zodSchema, 'length')) === null || _a === void 0 ? void 0 : _a.value;
            const maxLength = Number.isFinite(zodSchema.minLength)
                ? (_b = zodSchema.minLength) !== null && _b !== void 0 ? _b : undefined
                : undefined;
            const minLength = Number.isFinite(zodSchema.maxLength)
                ? (_c = zodSchema.maxLength) !== null && _c !== void 0 ? _c : undefined
                : undefined;
            return Object.assign(Object.assign({}, this.mapNullableType('string', isNullable)), { 
                // FIXME: https://github.com/colinhacks/zod/commit/d78047e9f44596a96d637abb0ce209cd2732d88c
                minLength: length !== null && length !== void 0 ? length : maxLength, maxLength: length !== null && length !== void 0 ? length : minLength, format: this.mapStringFormat(zodSchema), pattern: regexCheck === null || regexCheck === void 0 ? void 0 : regexCheck.regex.source, default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodNumber')) {
            return Object.assign(Object.assign(Object.assign({}, this.mapNullableType(zodSchema.isInt ? 'integer' : 'number', isNullable)), this.getNumberChecks(zodSchema._def.checks)), { default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodBigInt')) {
            return Object.assign(Object.assign(Object.assign({}, this.mapNullableType('integer', isNullable)), this.getNumberChecks(zodSchema._def.checks)), { format: 'int64', default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodBoolean')) {
            return Object.assign(Object.assign({}, this.mapNullableType('boolean', isNullable)), { default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodEffects')) {
            const innerSchema = zodSchema._def.schema;
            // Here we want to register any underlying schemas, however we do not want to
            // reference it, hence why `generateSchema` is used instead of `generateSchemaWithRef`
            return this.generateSchema(innerSchema);
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodLiteral')) {
            return Object.assign(Object.assign({}, this.mapNullableType(typeof zodSchema._def.value, isNullable)), { enum: [zodSchema._def.value], default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodEnum')) {
            // ZodEnum only accepts strings
            return Object.assign(Object.assign({}, this.mapNullableType('string', isNullable)), { enum: zodSchema._def.values, default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodNativeEnum')) {
            const { type, values } = (0, enum_info_1.enumInfo)(zodSchema._def.values);
            if (type === 'mixed') {
                // enum Test {
                //   A = 42,
                //   B = 'test',
                // }
                //
                // const result = z.nativeEnum(Test).parse('42');
                //
                // This is an error, so we can't just say it's a 'string'
                throw new errors_1.ZodToOpenAPIError('Enum has mixed string and number values, please specify the OpenAPI type manually');
            }
            return Object.assign(Object.assign({}, this.mapNullableType(type === 'numeric' ? 'integer' : 'string', isNullable)), { enum: values, default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodObject')) {
            return this.toOpenAPIObjectSchema(zodSchema, isNullable, defaultValue);
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodArray')) {
            const itemType = zodSchema._def.type;
            return Object.assign(Object.assign({}, this.mapNullableType('array', isNullable)), { items: this.generateSchemaWithRef(itemType), minItems: (_d = zodSchema._def.minLength) === null || _d === void 0 ? void 0 : _d.value, maxItems: (_e = zodSchema._def.maxLength) === null || _e === void 0 ? void 0 : _e.value, default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodTuple')) {
            const { items } = zodSchema._def;
            const tupleLength = items.length;
            const schemas = items.map(schema => this.generateSchemaWithRef(schema));
            const uniqueSchemas = (0, lodash_1.uniq)(schemas);
            if (uniqueSchemas.length === 1) {
                return {
                    type: 'array',
                    items: uniqueSchemas[0],
                    minItems: tupleLength,
                    maxItems: tupleLength,
                };
            }
            return Object.assign(Object.assign({}, this.mapNullableType('array', isNullable)), { items: {
                    anyOf: uniqueSchemas,
                }, minItems: tupleLength, maxItems: tupleLength });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodUnion')) {
            const options = this.flattenUnionTypes(zodSchema);
            const schemas = options.map(schema => {
                // If any of the underlying schemas of a union is .nullable then the whole union
                // would be nullable. `mapNullableOfArray` would place it where it belongs.
                // Therefor we are stripping the additional nullables from the inner schemas
                // See https://github.com/asteasolutions/zod-to-openapi/issues/149
                const optionToGenerate = this.unwrapNullable(schema);
                return this.generateSchemaWithRef(optionToGenerate);
            });
            return {
                anyOf: this.mapNullableOfArray(schemas, isNullable),
                default: defaultValue,
            };
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodDiscriminatedUnion')) {
            const options = [...zodSchema.options.values()];
            const optionSchema = options.map(schema => this.generateSchemaWithRef(schema));
            if (isNullable) {
                return {
                    oneOf: this.mapNullableOfArray(optionSchema, isNullable),
                    default: defaultValue,
                };
            }
            return {
                oneOf: optionSchema,
                discriminator: this.mapDiscriminator(options, zodSchema.discriminator),
                default: defaultValue,
            };
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodIntersection')) {
            const subtypes = this.flattenIntersectionTypes(zodSchema);
            const allOfSchema = {
                allOf: subtypes.map(schema => this.generateSchemaWithRef(schema)),
            };
            if (isNullable) {
                return {
                    anyOf: this.mapNullableOfArray([allOfSchema], isNullable),
                    default: defaultValue,
                };
            }
            return Object.assign(Object.assign({}, allOfSchema), { default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodRecord')) {
            const propertiesType = zodSchema._def.valueType;
            return Object.assign(Object.assign({}, this.mapNullableType('object', isNullable)), { additionalProperties: this.generateSchemaWithRef(propertiesType), default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodUnknown') || (0, zod_is_type_1.isZodType)(zodSchema, 'ZodAny')) {
            return this.mapNullableType(undefined, isNullable);
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodDate')) {
            return Object.assign(Object.assign({}, this.mapNullableType('string', isNullable)), { default: defaultValue });
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodPipeline')) {
            return this.toOpenAPISchema(zodSchema._def.in, isNullable, defaultValue);
        }
        const refId = this.getRefId(zodSchema);
        throw new errors_1.UnknownZodTypeError({
            currentSchema: zodSchema._def,
            schemaName: refId,
        });
    }
    isOptionalSchema(zodSchema) {
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodEffects')) {
            return this.isOptionalSchema(zodSchema._def.schema);
        }
        return zodSchema.isOptional();
    }
    getDefaultValue(zodSchema) {
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodOptional') ||
            (0, zod_is_type_1.isZodType)(zodSchema, 'ZodNullable')) {
            return this.getDefaultValue(zodSchema.unwrap());
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodEffects')) {
            return this.getDefaultValue(zodSchema._def.schema);
        }
        if ((0, zod_is_type_1.isZodType)(zodSchema, 'ZodDefault')) {
            return zodSchema._def.defaultValue();
        }
        return undefined;
    }
    requiredKeysOf(objectSchema) {
        return Object.entries(objectSchema._def.shape())
            .filter(([_key, type]) => !this.isOptionalSchema(type))
            .map(([key, _type]) => key);
    }
    toOpenAPIObjectSchema(zodSchema, isNullable, defaultValue) {
        var _a;
        const extendedFrom = (_a = this.getInternalMetadata(zodSchema)) === null || _a === void 0 ? void 0 : _a.extendedFrom;
        const required = this.requiredKeysOf(zodSchema);
        const properties = (0, lodash_1.mapValues)(zodSchema._def.shape(), _ => this.generateSchemaWithRef(_));
        if (!extendedFrom) {
            return Object.assign(Object.assign(Object.assign(Object.assign({}, this.mapNullableType('object', isNullable)), { default: defaultValue, properties }), (required.length > 0 ? { required } : {})), this.generateAdditionalProperties(zodSchema));
        }
        const parent = extendedFrom.schema;
        // We want to generate the parent schema so that it can be referenced down the line
        this.generateSchema(parent);
        const keysRequiredByParent = this.requiredKeysOf(parent);
        const propsOfParent = (0, lodash_1.mapValues)(parent === null || parent === void 0 ? void 0 : parent._def.shape(), _ => this.generateSchemaWithRef(_));
        const propertiesToAdd = Object.fromEntries(Object.entries(properties).filter(([key, type]) => {
            return !(0, lodash_1.objectEquals)(propsOfParent[key], type);
        }));
        const additionallyRequired = required.filter(prop => !keysRequiredByParent.includes(prop));
        const objectData = Object.assign(Object.assign(Object.assign(Object.assign({}, this.mapNullableType('object', isNullable)), { default: defaultValue, properties: propertiesToAdd }), (additionallyRequired.length > 0
            ? { required: additionallyRequired }
            : {})), this.generateAdditionalProperties(zodSchema));
        return {
            allOf: [
                { $ref: `#/components/schemas/${extendedFrom.refId}` },
                objectData,
            ],
        };
    }
    generateAdditionalProperties(zodSchema) {
        const unknownKeysOption = zodSchema._def.unknownKeys;
        const catchallSchema = zodSchema._def.catchall;
        if ((0, zod_is_type_1.isZodType)(catchallSchema, 'ZodNever')) {
            if (unknownKeysOption === 'strict') {
                return { additionalProperties: false };
            }
            return {};
        }
        return { additionalProperties: this.generateSchemaWithRef(catchallSchema) };
    }
    flattenUnionTypes(schema) {
        if (!(0, zod_is_type_1.isZodType)(schema, 'ZodUnion')) {
            return [schema];
        }
        const options = schema._def.options;
        return options.flatMap(option => this.flattenUnionTypes(option));
    }
    flattenIntersectionTypes(schema) {
        if (!(0, zod_is_type_1.isZodType)(schema, 'ZodIntersection')) {
            return [schema];
        }
        const leftSubTypes = this.flattenIntersectionTypes(schema._def.left);
        const rightSubTypes = this.flattenIntersectionTypes(schema._def.right);
        return [...leftSubTypes, ...rightSubTypes];
    }
    unwrapNullable(schema) {
        if ((0, zod_is_type_1.isZodType)(schema, 'ZodNullable')) {
            return this.unwrapNullable(schema.unwrap());
        }
        return schema;
    }
    unwrapChained(schema) {
        if ((0, zod_is_type_1.isZodType)(schema, 'ZodOptional') ||
            (0, zod_is_type_1.isZodType)(schema, 'ZodNullable') ||
            (0, zod_is_type_1.isZodType)(schema, 'ZodBranded')) {
            return this.unwrapChained(schema.unwrap());
        }
        if ((0, zod_is_type_1.isZodType)(schema, 'ZodDefault') || (0, zod_is_type_1.isZodType)(schema, 'ZodReadonly')) {
            return this.unwrapChained(schema._def.innerType);
        }
        if ((0, zod_is_type_1.isZodType)(schema, 'ZodEffects')) {
            return this.unwrapChained(schema._def.schema);
        }
        return schema;
    }
    /**
     * A method that omits all custom keys added to the regular OpenAPI
     * metadata properties
     */
    buildSchemaMetadata(metadata) {
        return (0, lodash_1.omitBy)((0, lodash_1.omit)(metadata, ['param']), lodash_1.isNil);
    }
    buildParameterMetadata(metadata) {
        return (0, lodash_1.omitBy)(metadata, lodash_1.isNil);
    }
    getParamMetadata(zodSchema) {
        var _a;
        const innerSchema = this.unwrapChained(zodSchema);
        const metadata = zodSchema._def.openapi
            ? zodSchema._def.openapi
            : innerSchema._def.openapi;
        /**
         * Every zod schema can receive a `description` by using the .describe method.
         * That description should be used when generating an OpenApi schema.
         * The `??` bellow makes sure we can handle both:
         * - schema.describe('Test').optional()
         * - schema.optional().describe('Test')
         */
        const zodDescription = (_a = zodSchema.description) !== null && _a !== void 0 ? _a : innerSchema.description;
        return {
            _internal: metadata === null || metadata === void 0 ? void 0 : metadata._internal,
            metadata: Object.assign(Object.assign({}, metadata === null || metadata === void 0 ? void 0 : metadata.metadata), { 
                // A description provided from .openapi() should be taken with higher precedence
                param: Object.assign({ description: zodDescription }, metadata === null || metadata === void 0 ? void 0 : metadata.metadata.param) }),
        };
    }
    getMetadata(zodSchema) {
        var _a;
        const innerSchema = this.unwrapChained(zodSchema);
        const metadata = zodSchema._def.openapi
            ? zodSchema._def.openapi
            : innerSchema._def.openapi;
        /**
         * Every zod schema can receive a `description` by using the .describe method.
         * That description should be used when generating an OpenApi schema.
         * The `??` bellow makes sure we can handle both:
         * - schema.describe('Test').optional()
         * - schema.optional().describe('Test')
         */
        const zodDescription = (_a = zodSchema.description) !== null && _a !== void 0 ? _a : innerSchema.description;
        // A description provided from .openapi() should be taken with higher precedence
        return {
            _internal: metadata === null || metadata === void 0 ? void 0 : metadata._internal,
            metadata: Object.assign({ description: zodDescription }, metadata === null || metadata === void 0 ? void 0 : metadata.metadata),
        };
    }
    getInternalMetadata(zodSchema) {
        const innerSchema = this.unwrapChained(zodSchema);
        const openapi = zodSchema._def.openapi
            ? zodSchema._def.openapi
            : innerSchema._def.openapi;
        return openapi === null || openapi === void 0 ? void 0 : openapi._internal;
    }
    getRefId(zodSchema) {
        var _a;
        return (_a = this.getInternalMetadata(zodSchema)) === null || _a === void 0 ? void 0 : _a.refId;
    }
    applySchemaMetadata(initialData, metadata) {
        return (0, lodash_1.omitBy)(Object.assign(Object.assign({}, initialData), this.buildSchemaMetadata(metadata)), lodash_1.isNil);
    }
    enhanceMissingParametersError(action, paramsToAdd) {
        try {
            return action();
        }
        catch (error) {
            if (error instanceof errors_1.MissingParameterDataError) {
                throw new errors_1.MissingParameterDataError(Object.assign(Object.assign({}, error.data), paramsToAdd));
            }
            throw error;
        }
    }
}
exports.OpenAPIGenerator = OpenAPIGenerator;
