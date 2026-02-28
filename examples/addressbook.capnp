@0x9a3f5c6b8d2e1f4a;

struct Person {
  id @0 :UInt32;
  name @1 :Text;
  email @2 :Text;
}

struct AddressBook {
  people @0 :List(Person);
}
