"""Load the Millbrook model, validate it against the SHACL shapes and run the example queries.

Usage:  pip install rdflib pyshacl && python semantic_model/validate.py
"""
from pathlib import Path

from pyshacl import validate
from rdflib import Graph

HERE = Path(__file__).parent


def load() -> Graph:
    g = Graph()
    g.parse(HERE / "ontology.ttl")
    g.parse(HERE / "millbrook.ttl")
    return g


def main() -> int:
    g = load()
    print(f"Loaded {len(g)} triples.\n")

    shapes = Graph().parse(HERE / "shapes.ttl")
    conforms, _, report = validate(g, shacl_graph=shapes, inference="rdfs")
    print("SHACL conforms:", conforms)
    if not conforms:
        print(report)

    for q in sorted((HERE / "queries").glob("*.rq")):
        print(f"\n== {q.name} ==")
        res = g.query(q.read_text())
        print(" | ".join(str(v) for v in res.vars))
        for row in res:
            print(" | ".join("" if v is None else str(v) for v in row))
    return 0 if conforms else 1


if __name__ == "__main__":
    raise SystemExit(main())
