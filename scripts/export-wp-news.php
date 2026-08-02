<?php
/**
 * Run on old server: wp eval-file export-wp-news.php --allow-root
 * Exports news + training-news posts as JSON to stdout.
 */
$cat_ids = [];
foreach (['news', 'training-news'] as $slug) {
    $term = get_term_by('slug', $slug, 'category');
    if ($term) $cat_ids[] = (int) $term->term_id;
}
if (!$cat_ids) {
    fwrite(STDERR, "No news categories found\n");
    exit(1);
}

$query = new WP_Query([
    'post_type'      => 'post',
    'post_status'    => 'publish',
    'posts_per_page' => -1,
    'category__in'   => $cat_ids,
    'orderby'        => 'date',
    'order'          => 'DESC',
]);

$hidden = [
    'tsae-2025-international-conference-on-zoom-sep-12-2025-2',
];

$out = [];
while ($query->have_posts()) {
    $query->the_post();
    $id = get_the_ID();
    $slug = get_post_field('post_name', $id);
    if (in_array($slug, $hidden, true)) continue;

    $cats = wp_get_post_categories($id, ['fields' => 'slugs']);
    $thumb_id = get_post_thumbnail_id($id);
    $image = $thumb_id ? wp_get_attachment_url($thumb_id) : null;

    $category = 'announcement';
    if (in_array('training-news', $cats, true)) $category = 'training';
    elseif (in_array('news', $cats, true)) {
        $title = get_the_title();
        $t = mb_strtolower($title);
        if (str_contains($t, 'ประชุม') || str_contains($t, 'conference')) $category = 'conference';
        elseif (str_contains($t, 'วารสาร') || str_contains($t, 'journal')) $category = 'journal';
        elseif (str_contains($t, 'อบรม') || str_contains($t, 'training')) $category = 'training';
        elseif (str_contains($t, 'กิจกรรม') || str_contains($t, 'activity')) $category = 'activity';
    }

    $out[] = [
        'id'       => $slug,
        'title'    => html_entity_decode(get_the_title(), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
        'date'     => get_the_date('c'),
        'category' => $category,
        'excerpt'  => html_entity_decode(get_the_excerpt(), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
        'image'    => $image,
        'featured' => (bool) get_post_field('menu_order', $id) || is_sticky($id),
        'author'   => get_the_author(),
        'html'     => apply_filters('the_content', get_the_content()),
    ];
}
wp_reset_postdata();

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
