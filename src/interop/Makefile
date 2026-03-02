# Makefile for Phase 2 interop test data generation

CXX = g++
CXXFLAGS = -std=c++17 -I/usr/local/include -I.
LDFLAGS = -lcapnp -lkj

.PHONY: all clean generate

all: generate-phase2

generate-phase2: generate-phase2.cpp test-schema-phase2.capnp.h
	$(CXX) $(CXXFLAGS) -o $@ generate-phase2.cpp $(LDFLAGS)

test-schema-phase2.capnp.h: test-schema-phase2.capnp
	capnp compile -oc++ test-schema-phase2.capnp

generate: generate-phase2
	./generate-phase2

clean:
	rm -f generate-phase2 test-schema-phase2.capnp.h test-schema-phase2.capnp.c++
