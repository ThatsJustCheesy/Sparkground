import { keyBy } from "lodash";
import {
  Binding,
  Cell,
  Environment,
  InitialEnvironment,
  makeEnv,
  mergeEnvs,
} from "../editor/library/environments";
import { isHole } from "../editor/trees/tree";
import { Expr, NameBinding } from "../expr/expr";
import { Defines } from "./defines";
import { checkCallAgainstTypeSignature } from "./dynamic-type";
import { FnValue, Value, valueAsBool } from "./value";

/** Call-by-value evaluator */
export class Evaluator {
  baseEnv: Environment;
  env: Environment;
  defines: Defines;

  constructor({ baseEnv, defines }: { baseEnv?: Environment; defines?: Defines } = {}) {
    this.baseEnv = baseEnv ?? InitialEnvironment;
    this.defines = defines ?? new Defines();
  }

  eval(expr: Expr, env: Environment = {}): Value {
    return this.#eval(expr, { env });
  }

  #eval(expr: Expr, { env, extendEnv }: { env?: Environment; extendEnv?: Environment } = {}) {
    const prevEnv = this.env;
    if (env) this.env = mergeEnvs(this.baseEnv, env);
    if (extendEnv) this.env = mergeEnvs(this.env, extendEnv);

    const result = this.#eval_(expr);

    this.env = prevEnv;
    return result;
  }

  #eval_(expr: Expr): Value {
    switch (expr.kind) {
      case "number":
      case "bool":
      case "string":
      case "symbol":
      case "list":
        if (isHole(expr)) {
          // TODO: More helpful behaviour
          throw "evaluating hole as expression";
        }
        return expr;

      case "var": {
        const cell = this.#get(expr.id);
        if (!cell?.value) throw "unbound variable: " + expr.id;

        return cell.value;
      }

      case "call": {
        const { called, args } = expr;

        const calledValue = this.#eval(called);
        if (calledValue.kind !== "fn") throw "cannot call non-function";

        const argValues = args.map((arg) => this.#eval(arg));

        return this.call(calledValue, argValues);
      }

      case "define":
        if (expr.name.kind !== "name-binding") throw "'define' must be given a name";

        this.defines.add(expr.name.id, () => ({ value: this.#eval(expr.value) }));

        return { kind: "list", heads: [] };

      case "let": {
        const valueBindings = expr.bindings.map(
          ([name, value]): Binding<Value> => ({
            name: (name as NameBinding).id,
            cell: { value: this.#eval(value) },
          })
        );

        return this.#eval(expr.body, { extendEnv: makeEnv(valueBindings) });
      }

      case "letrec": {
        const valueBindings = keyBy(
          expr.bindings.map(
            ([name]): Binding<Value> => ({
              name: (name as NameBinding).id,
              cell: {},
            })
          ),
          ({ name }) => name
        );

        expr.bindings.forEach(([name, value]) => {
          valueBindings[(name as NameBinding).id]!.cell.value = this.#eval(value);
        });

        return this.#eval(expr.body, { extendEnv: makeEnv(Object.values(valueBindings)) });
      }

      case "lambda":
        return {
          kind: "fn",
          signature: expr.params.map((param) => ({
            name: (param as NameBinding).id,
            // TODO: type and variadic?
          })),
          body: expr.body,
          env: this.env,
        };

      case "sequence": {
        let result: Value = { kind: "list", heads: [] };
        expr.exprs.forEach((expr) => {
          result = this.#eval(expr);
        });

        return result;
      }

      case "if":
        const condition = this.#eval(expr.if);
        return this.#eval(valueAsBool(condition) ? expr.then : expr.else);

      case "cond":
      case "name-binding":
      case "type":
        throw "TODO";
    }
  }

  call(fn: FnValue, args: Value[]): Value {
    checkCallAgainstTypeSignature(args, fn.signature);

    let callEnv = fn.env ?? {};
    for (let i = 0; i < args.length && i < fn.signature.length; ++i) {
      const { name } = fn.signature[i]!;
      const value = args[i]!;

      callEnv = mergeEnvs(callEnv, {
        [name]: {
          name,
          cell: { value },
        },
      });
    }

    let result: Value;
    if (typeof fn.body === "function") {
      // Builtin
      result = fn.body(args, this);
    } else {
      result = this.#eval(fn.body, { env: callEnv });
    }

    return result;
  }

  #get(name: string): Cell<Value> | undefined {
    return this.env[name]?.cell ?? this.defines.get(name);
  }
}
