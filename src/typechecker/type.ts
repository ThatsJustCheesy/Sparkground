/**
 * Static type (of an expression).
 *
 * Instances of `Type` do not contain "unknown" (unsolved) type variables.
 * However, they may be polymorphic; e.g.,, the identity function has type `Function[a, a]`,
 * where `a` is an unconstrained polymorphic type variable (`TypeVar`).
 *
 * To find the best available `Type` for an expression, use `Typechecker`.
 */
export type Type = ConcreteType | TypeVar;

/**
 * Static type (of an expression).
 *
 * e.g.,
 *  - `Int`
 *  - `List[Any]`
 *  - `Function[Int, String]`
 */
export type ConcreteType = SimpleConcreteType | VariadicFunctionType;

export type SimpleConcreteType<Tag extends string = string> = {
  tag: Tag;
  of?: Type[];
};

export type VariadicFunctionType = {
  tag: "Function*";
  of: Type[];

  minArgCount?: number;
  maxArgCount?: number;
};

export function typeParams(type: Type) {
  if (isTypeVar(type)) return [];
  return type.of ?? [];
}

export function functionParamTypes(
  fnType: SimpleConcreteType<"Function"> | VariadicFunctionType
): Type[] {
  return typeParams(fnType).slice(0, -1);
}
export function functionResultType(
  fnType: SimpleConcreteType<"Function"> | VariadicFunctionType
): Type {
  return typeParams(fnType).at(-1) ?? Any;
}

export function hasTag<Tag extends string>(type: Type, tag: Tag): type is SimpleConcreteType<Tag>;
export function hasTag(type: Type, tag: "Function*"): type is VariadicFunctionType;

export function hasTag<Tag extends string>(type: Type, tag: Tag): boolean {
  return !isTypeVar(type) && type.tag === tag;
}

/**
 * Placeholder for a type in a polymorphic type expression.
 *
 * e.g.,
 *  - the identity function has type `Function[a, a]`, where `a` is an unconstrained `TypeVar`
 *  - `cons` has type `Function[a, Function[List[a], List[a | b]]]`
 *    (among others), where `a` and `b` are unconstrained `TypeVar`s
 */
export type TypeVar = {
  /** Type variable name. */
  var: string;

  // TODO: These constraints are not implemented
  /** Subtype contraint: `a <: b` */
  below?: Type;
  /** Supertype contraint: `b <: a` or `a :> b` */
  above?: Type;
};
export function isTypeVar(type: Type | InferrableType): type is TypeVar {
  // FIXME: Prone to break if anyone uses this as a type parameter name!
  //        Use a special name to ensure no collisions.
  return "var" in type;
}

export function assertNoTypeVar(type: Type, message?: string): asserts type is ConcreteType;
export function assertNoTypeVar(
  type: InferrableType,
  message?: string
): asserts type is ConcreteInferrableType;
export function assertNoTypeVar(type: InferrableType, message?: string) {
  if (!hasNoTypeVar(type)) throw `assertion failed: ${message ?? "type has a type var"}`;
}
export function hasNoTypeVar(type: Type): type is ConcreteType;
export function hasNoTypeVar(type: InferrableType): type is ConcreteInferrableType;
export function hasNoTypeVar(type: InferrableType) {
  return isUnknown(type) || (!isTypeVar(type) && (type.of?.every(hasNoTypeVar) ?? true));
}

export type BuiltinType =
  | { tag: "Any" }
  | { tag: "Never" }
  | { tag: "Null" }
  | { tag: "Number" }
  | { tag: "Integer" }
  | { tag: "Boolean" }
  | { tag: "String" }
  | { tag: "Symbol" }
  | { tag: "List"; of: [element: Type] }
  | { tag: "Function"; of: Type[] }
  | { tag: "Promise"; of: [value: Type] };

export const Any = { tag: "Any" };
export const Never = { tag: "Never" };

// For type inference algorithm only.
export type InferrableType = ConcreteInferrableType | TypeVar;
export type ConcreteInferrableType =
  | {
      tag: string;
      of?: InferrableType[];
    }
  | Unknown;

// Ditto.
export type Unknown = { unknown: string };
export function isUnknown(type: InferrableType): type is Unknown {
  // FIXME: Prone to break if anyone uses this as a type parameter name!
  //        Use a special name to ensure no collisions.
  return "unknown" in type;
}

// Ditto.
export function assertNoUnknown(type: InferrableType, message?: string): asserts type is Type {
  if (!hasNoUnknown(type)) throw `assertion failed: ${message ?? "type has unknown"}`;
}
export function hasNoUnknown(type: InferrableType): type is Type {
  return isTypeVar(type) || (!isUnknown(type) && (type.of?.every(hasNoUnknown) ?? true));
}

/**
 * fmap for `Type`, `InferrableType`, etc.
 */
export function typeStructureMap<T extends Type | InferrableType, R extends T>(
  t: T,
  fn: (t_: T) => R
): R;

export function typeStructureMap(
  t: InferrableType,
  fn: (t_: InferrableType) => InferrableType
): InferrableType {
  if (isUnknown(t) || isTypeVar(t)) return t;
  return {
    tag: t.tag,
    of: t.of?.map(fn),
  } as InferrableType;
}
