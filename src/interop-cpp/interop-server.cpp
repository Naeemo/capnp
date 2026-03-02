// C++ Interop Test - Server Implementation
// For testing capnp-ts RPC compatibility with official C++ implementation

#include <capnp/ez-rpc.h>
#include <capnp/message.h>
#include <iostream>
#include <cstring>

#include "interop.capnp.h"

using namespace capnp;
using namespace kj;

// EchoService Implementation
class EchoServiceImpl final: public EchoService::Server {
public:
  kj::Promise<void> echo(EchoContext context) override {
    auto params = context.getParams();
    auto result = context.getResults();
    result.setResult(params.getMessage());
    return kj::READY_NOW;
  }

  kj::Promise<void> echoStruct(EchoStructContext context) override {
    auto params = context.getParams();
    auto result = context.getResults();
    result.setOutput(params.getInput());
    return kj::READY_NOW;
  }

  kj::Promise<void> getCounter(GetCounterContext context) override {
    auto result = context.getResults();
    result.setValue(counter);
    return kj::READY_NOW;
  }

  kj::Promise<void> increment(IncrementContext context) override {
    auto result = context.getResults();
    result.setNewValue(++counter);
    return kj::READY_NOW;
  }

private:
  uint32_t counter = 0;
};

int main(int argc, char* argv[]) {
  if (argc < 2) {
    std::cerr << "Usage: " << argv[0] << " [server|client] [address]" << std::endl;
    std::cerr << "  server: " << argv[0] << " server 0.0.0.0:8080" << std::endl;
    std::cerr << "  client: " << argv[0] << " client localhost:8080" << std::endl;
    return 1;
  }

  std::string mode = argv[1];
  std::string address = argc > 2 ? argv[2] : "localhost:8080";

  if (mode == "server") {
    std::cout << "Starting C++ RPC server on " << address << std::endl;
    
    EzRpcServer server(kj::heap<EchoServiceImpl>(), address);
    
    std::cout << "Server running. Waiting for connections..." << std::endl;
    
    kj::NEVER_DONE.wait(server.getWaitScope());
    
  } else if (mode == "client") {
    std::cout << "Connecting to " << address << std::endl;
    
    EzRpcClient client(address);
    auto echo = client.getMain<EchoService>();
    
    // Test echo
    std::cout << "\n=== Testing EchoService ===" << std::endl;
    {
      auto request = echo.echoRequest();
      request.setMessage("Hello from C++ client!");
      auto response = request.send().wait(client.getWaitScope());
      std::cout << "echo: " << response.getResult().cStr() << std::endl;
    }
    
    std::cout << "\nAll tests passed!" << std::endl;
  }
  
  return 0;
}
