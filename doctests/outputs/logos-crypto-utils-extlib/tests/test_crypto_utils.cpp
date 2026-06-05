#include <logos_test.h>
#include "../src/crypto_utils_impl.h"

LOGOS_TEST(checksum_works) {
    CryptoUtilsImpl impl;
    auto result = impl.checksum(std::string("test"));
    (void)result;
}

LOGOS_TEST(caesar_shift_works) {
    CryptoUtilsImpl impl;
    auto result = impl.caesar_shift(1, 1);
    (void)result;
}

LOGOS_TEST(version_works) {
    CryptoUtilsImpl impl;
    auto result = impl.version();
    (void)result;
}
