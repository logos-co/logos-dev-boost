#include <logos_test.h>
#include "../src/crypto_utils_impl.h"

LOGOS_TEST(echo_returns_prefixed_input) {
    CryptoUtilsImpl impl;
    LOGOS_ASSERT_EQ(impl.echo("hello"), std::string("echo: hello"));
}

LOGOS_TEST(echo_handles_empty_input) {
    CryptoUtilsImpl impl;
    LOGOS_ASSERT_EQ(impl.echo(""), std::string("echo: "));
}
