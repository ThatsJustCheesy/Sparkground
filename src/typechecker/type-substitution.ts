import {
  Type,
  isConcreteType,
  isForallType,
  isTypeNameHole,
  isTypeVar,
  isTypeVarBoundBy,
  isTypeVarSlot,
  typeParams,
} from "./type";

export type TypeSubstitution = Record<string, Type>;

export function typeSubstitute(type: Type, sub: TypeSubstitution): Type {
  if (isTypeVarSlot(type)) {
    return type;
  } else if (isTypeVar(type)) {
    return sub[type.var] ?? type;
  } else if (isForallType(type)) {
    return {
      forall: type.forall,
      body: typeSubstitute(type.body, sub),
    };
  } else {
    const tag = type.tag;
    const params = typeParams(type).map((typeParam) => typeSubstitute(typeParam, sub));
    return params.length ? { tag, of: params } : { tag };
  }
}

export function typeVarOccurs(typeVarName: string, type: Type): boolean {
  if (isTypeVar(type)) {
    return type.var === typeVarName;
  } else if (isForallType(type)) {
    if (isTypeVarBoundBy(typeVarName, type)) {
      // Shadowed
      return false;
    }
    return typeVarOccurs(typeVarName, type.body);
  } else if (isConcreteType(type)) {
    return (type.of ?? []).some((child) => typeVarOccurs(typeVarName, child));
  } else if (isTypeNameHole(type)) {
    return false;
  }
  throw "invalid type passed to typeVarOccurs";
}
