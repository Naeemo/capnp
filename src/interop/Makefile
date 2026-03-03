# Makefile for interop test data generation

CXX = g++
CXXFLAGS = -std=c++17 -I/usr/local/include -I.
LDFLAGS = -lcapnp -lkj

.PHONY: all clean generate

all: generate-test-data

generate-test-data: generate-test-data.cpp test-schema-extended.capnp.h
	$(CXX) $(CXXFLAGS) -o $@ generate-test-data.cpp $(LDFLAGS)

test-schema-extended.capnp.h: test-schema-extended.capnp
	capnp compile -oc++ test-schema-extended.capnp

generate: generate-test-data
	./generate-test-data

clean:
	rm -f generate-test-data test-schema-extended.capnp.h test-schema-extended.capnp.c++
