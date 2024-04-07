import { Parser } from "../expr/parse"
import { Parser as DatumParser } from "../datum/parse"
import { Lambda } from "../expr/expr"
import { Evaluator } from "./evaluate"
import { FnValue, Value } from "./value"
import { datumEqual } from "../datum/equality"
import { Environment } from "../editor/library/environments"

describe("evaluate", () => {
  let evaluator: Evaluator
  beforeEach(() => {
    evaluator = new Evaluator()
  })

  it("evals literal values", () => {
    expect(evaluator.eval({ kind: "Number", value: 42 })).toEqual<Value>({ kind: "Number", value: 42 })
    expect(evaluator.eval({ kind: "Boolean", value: true })).toEqual<Value>({ kind: "Boolean", value: true })
    expect(evaluator.eval({ kind: "String", value: "hello" })).toEqual<Value>({ kind: "String", value: "hello" })
  })

  it("evals variables", () => {
    expect(() => evaluator.eval({ kind: "var", id: "x" })).toThrow()
    expect(
      evaluator.eval({ kind: "var", id: "x" }, { extendEnv: { x: { name: "x", cell: { value: { kind: "Number", value: 42 } } } } })
    ).toEqual<Value>({
      kind: "Number",
      value: 42,
    })
  })

  it("evals sequences", () => {
    expect(
      evaluator.eval({
        kind: "sequence",
        exprs: [
          { kind: "Boolean", value: false },
          { kind: "String", value: "result" },
        ],
      })
    ).toEqual<Value>({ kind: "String", value: "result" })
  })

  it("evals procedures", () => {
    const const42: Lambda = { kind: "lambda", params: [], body: { kind: "Number", value: 42 } }
    expect(evaluator.eval(const42)).toEqual<Value>(
      expect.objectContaining({ kind: "fn", signature: [], body: { kind: "Number", value: 42 } })
    )
    expect(evaluator.eval({ kind: "call", called: const42, args: [] })).toEqual<Value>({ kind: "Number", value: 42 })
  })

  it("evals unary functions", () => {
    const id: Lambda = { kind: "lambda", params: [{ kind: "name-binding", id: "x" }], body: { kind: "var", id: "x" } }
    expect(evaluator.eval(id)).toEqual<Value>(
      expect.objectContaining({ kind: "fn", signature: [{ name: "x" }], body: { kind: "var", id: "x" } })
    )
    expect(evaluator.eval({ kind: "call", called: id, args: [{ kind: "Number", value: 42 }] })).toEqual<Value>({
      kind: "Number",
      value: 42,
    })
  })

  it("evals binary functions", () => {
    const second: Lambda = {
      kind: "lambda",
      params: [
        { kind: "name-binding", id: "x" },
        { kind: "name-binding", id: "y" },
      ],
      body: { kind: "var", id: "y" },
    }
    expect(evaluator.eval(second)).toEqual<Value>(
      expect.objectContaining({
        kind: "fn",
        signature: [{ name: "x" }, { name: "y" }],
        body: { kind: "var", id: "y" },
      })
    )
    expect(
      evaluator.eval({
        kind: "call",
        called: second,
        args: [
          { kind: "Number", value: 0 },
          { kind: "String", value: "" },
        ],
      })
    ).toEqual<Value>({ kind: "String", value: "" })
  })

  it("treats lambdas as closures with lexical scoping", () => {
    const returnX: Lambda = { kind: "lambda", params: [], body: { kind: "var", id: "x" } }
    const extendEnv: Environment = { x: { name: "x", cell: { value: { kind: "Number", value: 42 } } } }

    const closure = evaluator.eval(returnX, { extendEnv })
    expect(closure).toEqual<Value>({
      kind: "fn",
      signature: [],
      body: { kind: "var", id: "x" },
      env: expect.objectContaining({
        x: { name: "x", cell: { value: { kind: "Number", value: 42 } } },
      } satisfies Environment),
    })

    expect(
      evaluator.eval(
        { kind: "call", called: { kind: "var", id: "closure" }, args: [] },
        {
          extendEnv: { closure: { name: "closure", cell: { value: closure } } },
        }
      )
    ).toEqual<Value>({ kind: "Number", value: 42 })
  })

  it("evals quote and returns value verbatim", () => {
    const quoteResult = evaluator.eval(Parser.parseToExpr("(quote (1 #t abc () (2 3)))"))
    const datum = DatumParser.parseToDatum("(1 #t abc () (2 3))")
    expect(datumEqual(quoteResult!, datum))
  })

  it("evals calls to builtins", () => {
    const consResult = evaluator.eval(Parser.parseToExpr("(cons 3 (cons 2 (cons 1 (null))))"))
    const datum = DatumParser.parseToDatum("(3 2 1)")
    expect(datumEqual(consResult!, datum)).toBeTruthy()
  })

  it("checks the types of function parameters", () => {
    const body: FnValue["body"] = () => {
      return { kind: "List", heads: [] }
    }

    // No formal, one actual
    expect(() => evaluator.call({ kind: "fn", signature: [], body }, [{ kind: "Boolean", value: true }])).toThrow()

    // One formal, no actual
    expect(() => evaluator.call({ kind: "fn", signature: [{ name: "x", type: "Boolean" }], body }, [])).toThrow()

    // One formal, one actual, type mismatch
    expect(() =>
      evaluator.call({ kind: "fn", signature: [{ name: "x", type: "Number" }], body }, [{ kind: "Boolean", value: true }])
    ).toThrow()

    // Variadic formal, no actual
    expect(() => evaluator.call({ kind: "fn", signature: [{ name: "x", variadic: true }], body }, [])).not.toThrow()

    // Variadic formal, 2 actual
    expect(() =>
      evaluator.call({ kind: "fn", signature: [{ name: "x", variadic: true }], body }, [
        { kind: "Boolean", value: true },
        { kind: "Number", value: 123 },
      ])
    ).not.toThrow()
  })
})
