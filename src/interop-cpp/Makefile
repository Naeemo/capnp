CXX = g++
CXXFLAGS = -std=c++17 -I/usr/include -I.
LDFLAGS = -lcapnp -lkj -lcapnp-rpc -lkj-async

.PHONY: all clean

all: interop-server

interop.capnp.c++: interop.capnp
	capnp compile -oc++ interop.capnp

interop-server: interop-server.cpp interop.capnp.c++
	$(CXX) $(CXXFLAGS) -o $@ interop-server.cpp interop.capnp.c++ $(LDFLAGS)

clean:
	rm -f interop-server interop.capnp.h interop.capnp.c++

run-server: interop-server
	./interop-server server 0.0.0.0:8080

run-client: interop-server
	./interop-server client localhost:8080
