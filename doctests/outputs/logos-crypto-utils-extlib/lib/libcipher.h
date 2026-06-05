#ifndef LIBCIPHER_H
#define LIBCIPHER_H

#ifdef __cplusplus
extern "C" {
#endif

/** Sum of the byte values of `text` (a simple checksum). */
int cipher_checksum(const char* text);

/** Caesar-shift a character code by `shift` positions. */
int cipher_caesar_shift(int code, int shift);

/** Library version string. Caller must NOT free. */
const char* cipher_version(void);

#ifdef __cplusplus
}
#endif

#endif /* LIBCIPHER_H */
