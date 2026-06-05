cmake_minimum_required(VERSION 3.14)
project(CryptoUtilsTests LANGUAGES CXX)

include(LogosTest)

logos_test(
    NAME crypto_utils_tests
    MODULE_SOURCES ../src/crypto_utils_impl.cpp
    TEST_SOURCES
        main.cpp
        test_crypto_utils.cpp
)
