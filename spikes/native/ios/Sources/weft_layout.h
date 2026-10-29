// C ABI of crates/weft-layout (src/lib.rs). Bridged into Swift.
#include <stdint.h>

typedef struct Tree Tree;
typedef void (*wl_measure_fn)(void *user, uint32_t id, float known_w, float known_h, float avail_w, float avail_h, float *out);

Tree *wl_tree_new(wl_measure_fn measure, void *user);
void wl_tree_free(Tree *t);
void wl_node(Tree *t, uint32_t id, uint32_t measured);
void wl_remove(Tree *t, uint32_t id);
void wl_insert(Tree *t, uint32_t parent, uint32_t id, uint32_t before);
void wl_set(Tree *t, uint32_t id, uint32_t key, float value);
void wl_dirty(Tree *t, uint32_t id);
void wl_compute(Tree *t, uint32_t root, float w, float h);
uint32_t wl_frame(Tree *t, uint32_t id, float *out);
