#include "libcipher.h"

int cipher_checksum(const char* text)
{
    int sum = 0;
    if (!text) return 0;
    for (const char* p = text; *p; ++p)
        sum += (unsigned char)*p;
    return sum;
}

int cipher_caesar_shift(int code, int shift)
{
    return code + shift;
}

const char* cipher_version(void)
{
    return "1.0.0";
}
